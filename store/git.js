var StoreBase=require("../Store").Store;
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var All = require("promised-io/promise").all;
var ArrayQuery = require("rql/js-array").query;
var git = require("nodegit");
var declare = require("dojo-declare/declare");
var fs = require("fs-extra");
var Path = require('path');
var uuid = require("node-uuid");
var mime = require("mime");
var spawn = require('child_process').spawn;
var rawGitHandler = require('git-http-backend');


var Store = exports.Store=declare([StoreBase],{
	authConfigProperty: "git",
	primaryKey: "id",
	metadataFilename: "_metadata.json",
	init: function(){
		console.log("Init Git Store", this.options.auth);
		this.setupStore(this.options.auth.path + "/" + this.id + "/"); 
	},

	setupStore: function(path){
		this.basePath = path;
		console.log("Base Path: ", this.basePath);
		var def = new defer();
		fs.stat(this.basePath, function(err,stats){
			if (err || (!stats)) { 
				console.log("Error Reading Path: ", path + "\n\t",  err); 
					
				fs.mkdirs(path, function(err,cb){
					if (err) { console.log("Error Creating Directory: ", err); def.reject(err); return; }
					console.log("Created GIT Store Directory: ", this.basePath);
					def.resolve(true);			
				});	
				return;
			}
			def.resolve(true);
		});

		return def.promise;
	},

	handleRawGit: function(repoId,url,opts){
                       console.log("Handle Raw Git url: ",url );
                       console.log("Handle Raw Git repoId: ", repoId);
		var def = new defer()
		url = opts.req.originalUrl;	
		var idParts = repoId.split("-");

		var lastRepoPart = idParts[idParts.length-1];
		var objectPath = this.basePath + idParts.join("/");	
		console.log("Repo Path: ", objectPath);
		console.log("url: ", url);
	//	delete opts.req.headers['accept']

		var gb = opts.req.pipe(rawGitHandler(url, function(err,service){
			if (err) {
                                console.log("RAW GIT ERR: ", err);
				if (err) return opts.res.send(err + '\n');
			}
			opts.res.set('content-type', service.type);
			console.log("Service Type: ", service.type);
			var args =  service.args.concat([objectPath]);
			console.log("Service Args: ", args);
			console.log(service.cmd, service.action, repoId, service.fields, args);
			var ps = spawn(service.cmd, args);
			ps.stdout.pipe(service.createStream()).pipe(ps.stdin);
       		})).pipe(opts.res);

		def.resolve({stream: true});
		return def.promise;

	},

	get: function(fullId,opts){
		var parts = fullId.split("/");
		var id = parts.shift();
		var subPath = parts.join("/");

		var idParts = id.split("-");
		var objectPath = this.basePath + idParts.join("/");	
		var _self=this;
		if (opts && opts.rawGitRequest){
			return this.handleRawGit(opts.repoId,opts.subPath,opts);
		}

		var repo = this.getRepository(objectPath);

		if (!subPath){
			return _self.getMetadata(repo,id);
		}

		return _self.getFile(repo,id,subPath);
	},


	getFile: function(repo,id,filepath){
		var _self=this;
		var def = new defer();
		var filename = filepath;
		when(repo, function(repo) {
			repo.getMaster(function(error,branch) {
				if (error) { console.log("Branch Not Found"); return; def.reject("Unable to Open Master Branch: " + error); }
				branch.getTree(function(error, tree) {
					console.log("Get ", filename, " from tree");	
					tree.getEntry(filename, function(err,entry){
						if (err || !entry) { console.log("File Not Found: ", filename); def.resolve("");return; }
						console.log("Entry: ", entry.path(), entry.name(), entry.isFile());
						if (entry.isFile()) {
							console.log("File Entry: ", entry.path(), entry.name());
							entry.getBlob(function(err,blob) {
								if (err || !blob) { def.reject(err); }
								def.resolve({id: Path.join(id,filepath), mimeType: mime.lookup(filepath),binary: blob.isBinary(), buffer: blob.content()});
							});
						}else if (entry.isTree()){
							console.log("Get Folder ",entry.path(), entry.name());
//							var folder = entry.getTree();
							entry.getTree(function(err,folder) {
								when(_self.getManifestFromTree(folder,entry), function(manifest){
									console.log("Manifest: ", manifest);
									def.resolve({id: filepath, name: entry.name(), manifest: manifest});
								});	
							});
						}
					})
				});
			});
		});
		return def.promise;
	},

	getManifestFromTree: function(tree,rootEntry){
		var treeWalker = tree.walk(false);
		var def = new defer();
		var blobdefs=[];
		var manifest={};


		function addToManifest(f) {
			var dirname = Path.dirname(f.id);
			var parts = dirname.split("/");
			var current = manifest;	
			var currentP = ""
			parts.forEach(function(p){
				currentP += p;
				if (!current[p]){ current[p]={"..":{id: currentP,name: "..",isFile: false,isTree: true}}}
				current = current[p];
			});
			current[f.name]=f;
		}	

		treeWalker.on("entry", function(entry){
			if (entry==rootEntry){return;}
			
			var f = {id: entry.path(), name: entry.name(),isFile: entry.isFile(),isTree: entry.isTree(), sha: entry.sha(),oid: entry.oid() };
				
			var ready = true;
			if (f.isFile) {
				ready = new defer();
				entry.getBlob(function(err,blob) {
					f.binary= blob.isBinary()
					f.size= blob.size()
					f.filemode=blob.filemode()
					ready.resolve(true);
				});
			}else if (entry.isTree()){
				ready=true;
			}
			blobdefs.push(when((ready && ready.promise)?ready.promise:ready, function(){
				addToManifest(f);
			}));
		});

		treeWalker.on("end", function(){
			when(All(blobdefs), function(){
				if (rootEntry) {
					var dirname = rootEntry.name();
					if(manifest[dirname]){
						manifest = manifest[dirname];
					}
				}
				def.resolve(manifest);
			});
		});
		treeWalker.start();
		return def.promise;
	},

	getMetadata: function(repo,id){
		var _self=this;
		var def = new defer();
		var metadataObject = {id:id,manifest:[]};
		when(repo, function(repo) {
			repo.getMaster(function(error,branch) {
				if (error) { console.log("Branch Not Found"); return; def.reject("Unable to Open Master Branch: " + error); }

				metadataObject.updatedOn=branch.timeMs() 
				branch.getTree(function(error, tree) {
					tree.getEntry(_self.metadataFilename, function(err,entry){
						entry.getBlob(function(err,blob){
							var o = blob.toString()
							console.log("STRING BLOB: ", o);
							o= JSON.parse(o);
							for (prop in o) { metadataObject[prop] = o[prop]; }

							when(_self.getManifestFromTree(tree), function(manifest){
								metadataObject.manifest = manifest;
								def.resolve(metadataObject);
							});
						});
					});
				})
			});
		});

		return def.promise;
	},

	getFileFromRepo: function(repo, filename, handleAs){
		var def=new defer();
		var _self=this;
		repo.getMaster(function(error,branch) {
			branch.getTree(function(error, tree) {
				if (error) throw error;
				var entries = tree.entries();
				console.log("TreeEntries: ", tree.entries());

				entries.forEach(function(entry) {
					console.log("Entry - Path ", entry.path(), " Name: ", entry.name(), " File: ", entry.isFile()?"True":"False");
				});

			});
		});
		return def.promse;
	
	},

	query: function(query,opts){
		return ArrayQuery(query,opts,this.data);
	},

	add: function(obj,opts){
		var id = (opts&&opts.id)?opts.id: uuid.v4();	
		obj.id = id;
		this.put(obj,opts);	
	},

	post: function(obj,opts){
	//	console.log("POST: ", obj);
                if (opts && opts.rawGitRequest){
			console.log("raw git POST: ", opts.repoId, opts.subPath);
                        return this.handleRawGit(opts.repoId,opts.subPath,opts);
                }      
		var _self=this;
		var results=[]
		var defs=[]

		if (!obj.id) {
			return this.add(obj,opts);	
		}else{
			if (obj.files) {
				obj.files = Object.keys(obj.files).map(function(key){
					var f = obj.files[key];
					return {upload: true, tempPath: f.path, filename:Path.join(obj.basePath,f.originalFilename)};
				});
			}
			
			return this.put(obj,opts)
		}

	},
	put: function(obj, opts){
		console.log("GIT PUT OBJ: ", obj);
	//	console.log("GIT PUT OPTS REQ: ", opts.req);

		if (opts.rawGitRequest) {
			return this.handleRawGit(opts.repoId,opts.subPath,opts);
		}
		var idParts = obj.id.split("-");
		var objectPath = this.basePath + idParts.join("/");	
		var _self=this;
		var repo = this.getRepository(objectPath)

		if (obj.files) {
			return when(repo, function(repo){
				var author = (opts && opts.author)?opts.author:{name: "System", email: "system"};
				return when(_self.commitFilesToRepo(repo, obj.files, "Uploaded Files", author),function(){
					return {status: "ok"}
				});
			});
		}

		var fileName = this.metadataFilename;
		var fileContent = JSON.stringify(obj);
		var author = (opts && opts.author)?opts.author:{name: "System", email: "system"};
		var files = []
		files.push({blobName: this.metadataFilename, type: "text", content: JSON.stringify(obj)});

		return when(repo, function(repo) {
			//create the file in the repo's workdir
			return _self.commitFilesToRepo(repo, files,"commit message", author);
		});
	},
	initializeRepository: function(path,initialContent) {
		var def = new defer();
		var _self=this;
		console.log("Initialize New Collection: ", path);
		fs.mkdirs(path, function(err) {
			if (err) { def.reject(err);return; }
			console.log("\tCreated new directory: ", path);
			git.Repo.init(path,true,function(err,repo){
				console.log("\tCreated new collection repository: ", repo);
				if (initialContent) {
					var str = JSON.stringify(initialContent);
					buffer = new Buffer(str);
					console.log("Created Buffer");
					repo.createBlobFromBuffer(buffer, function(err,blob) {
						if (err) { throw err; }
						console.log("Building Tree");
						var tb = repo.treeBuilder();
						tb.insert(_self.metadataFilename,blob,0100644);
						console.log("Writing Tree");
						tb.write(function(treeWriteError,treeId){
							console.log("tb.write arguments", arguments);
							if (treeWriteError) { throw treeWriteError; }
				
							console.log("Create Commit");	 
							var author = git.Signature.create("system", "system@system", 123456789, 60);
							var committer = git.Signature.create("system", "system@system", 987654321, 90);

							repo.createCommit("HEAD", author, committer, "Inital Commit", treeId,[], function(error, commitId) {
								console.log("New Commit:", commitId.sha());
								def.resolve(repo);
							});
						});
					});
				}else{
					def.resolve(repo);
				}
			});
			
		});
		return def.promise;
	},
	storeCollectionMeta: function(path, obj) {
		var def = new defer();
		console.log("Store Meta() path: ", path," obj:", obj );
		def.resolve(obj);
		return def.promise;
	},

	getRepository: function(filepath) {
		var def = new defer();
		var _self=this;
		fs.exists(filepath, function(exists){
			if (!exists) {
				console.log("Creating New Repository: ", filepath);
				when(_self.initializeRepository(filepath, {repoCreationDate: new Date().toISOString()}), function(repo){
					def.resolve(repo);
				});
			}else {
				console.log("Found Repository: ", filepath);
				git.Repo.open(filepath, function(err,repo){
					def.resolve(repo);
				});
			}
		});

		return def.promise;
	},

	writeFileToRepo: function(repo,fileobj){
		var def = new defer()
		if (fileobj && fileobj.tempPath) {
			console.log("Copy from ", fileobj.tempPath, " to ", fileobj.filename);
			fs.copy(fileobj.tempPath,Path.join(repo.workdir(),fileobj.filename),null, function(copyError){
				if (copyError) { return def.reject(copyError); }
				def.resolve(true);

				// delete the temp file after copy is complete. 
				fs.unlink(fileobj.tempPath, function(unlinkError){
					if (unlinkError) { console.warn("Error Deleting Temporary Upload File: ", fileobj.tempPath); }
				});
			});
		
		}else if (fileobj && fileobj.type && fileobj.type=="text") {
			var content = fileobj.content;
//			if (typeof fileobj != "string"){
//				content = JSON.stringify(content);
//			}
			var buf = new Buffer(content, 'ascii');
			
			/*
			fs.writeFile(Path.join(repo.workdir(),fileobj.filename), content, function(writeError){
				if (writeError) { return def.reject(writeError); }
				def.resolve(true);
			});
			*/
		}else{
			def.reject(new Error("Binary Files Not Implemented"));
		}
		return def.promise;
	},

	writeFilesToRepo: function(repo, files) {
		var _self=this;
		return when(repo, function(repo) {
			var defs = files.map(function(fileobj){
				return _self.writeFileToRepo(repo,fileobj);
			});
			return All(defs);
		});	
	},

	addFilesToIndex: function(index,files){
		var defs = files.map(function(fileobj){
			var def = new defer();
			index.addByPath(fileobj.filename, function(addByPathError){
				if (addByPathError) { def.reject(addByPathError);return; }
				index.write(function(writeError){
					if (writeError) {def.reject(writeError); return;}
					def.resolve();
				});
			})
			return def.promise;
		});	

		return All(defs);
	},

	commitFilesToRepo: function(repo, files, msg, author){
		var _self = this;
		return when(this.writeFilesToRepo(repo,files), function(){
			//add the file to the index...
			var def = new defer()
			repo.openIndex(function(openIndexError, index) {
				if (openIndexError) return def.reject(openIndexError);

				index.read(function(readError) {
					if (readError) return def.reject(readError);

					when(_self.addFilesToIndex(index,files), function(err) {
						index.writeTree(function(writeTreeError, oid) {
							if (writeTreeError) return def.reject(writeTreeError);

							//get HEAD
							git.Reference.oidForName(repo, 'HEAD', function(oidForName, head) {
								console.log("oidForName: ", oidForName);
								////if (oidForName) return def.reject(oidForName);
								//get latest commit (will be the parent commit)
								repo.getCommit(head, function(getCommitError, parent) {
									var authorSig = git.Signature.create(author.name,author.email, parseInt((new Date().valueOf())/1000),0);
									var committerSig = git.Signature.create(author.name,author.email, parseInt((new Date().valueOf())/1000),0);
									repo.createCommit('HEAD', authorSig, committerSig, msg, oid, parent?[parent]:[], function(error, commitId) {
//										if (error) { return def.reject(error); }	
										console.log("New Commit:", commitId.sha());
										def.resolve(commitId.sha());
									});
								});
							
							});
						});
					});
				});
			});
			return def.promise;
		});
	},

	"delete": function(id, opts){
		delete this.data[id];
		return true;
	}
});
