var StoreBase=require("../Store").Store;
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var All = require("promised-io/promise").all;
var ArrayQuery = require("rql/js-array").query;
var LazyArray = require("promised-io/lazy-array").LazyArray;
var git = require("nodegit");
var declare = require("dojo-declare/declare");
var fs = require("fs-extra");
var Path = require('path');
var uuid = require("node-uuid");
var mime = require("mime");
var spawn = require('child_process').spawn;
var rawGitHandler = require('git-http-backend');
var glob=require('glob');

var Store = exports.Store=declare([StoreBase],{
	authConfigProperty: "git",
	primaryKey: "id",
	metadataFilename: "_metadata.json",
	init: function(){
		this.setupStore(this.options.auth.path + "/" + this.id); 
	},

	scanRepos: function(){
		var def = new defer();
		glob("**/HEAD", {cwd:this.basePath}, function(err,files){
			if (err) { return def.reject(err); }
			var out = files.map(function(f){  var x = f.split("/"); x.pop(); return x.join("/") });
			def.resolve(out);
		});		
		return def.promise;
	},

	loadIndex: function() {
		var _self=this;	
		var index=[];
		var d = new defer();
		when(this.scanRepos(), function(scanRes){
			var defs=[];
			scanRes.forEach(function(repoPath){
				var def = new defer();
				var objPath=Path.join(_self.basePath,repoPath);
				var id = repoPath.replace(_self.basePath,"").split("/").join("-");
				//console.log("Load Repository for ID: ", id, repoPath);
				when(_self.getRepository(id), function(repo){
					if (!repo) {
						console.log("Unable to read repo at: ", repo);
						def.resolve(true);
					}

					when(_self.getMetadata(repo,id),function(md){
						if (md) {
								
							console.log("Push Metadata for ", md.id, " into index.\n");
							//if (!index[md.id]) {
								index.push(md);	
							//}
							index[md.id]=md;
							return def.resolve(true);
						}
					}, function(err){
						console.log("Error getting metadata: ", err);
						return def.resolve(true);
					});
				}, function(err){
					console.log("Unable to read repo for " + id);
				});
				defs.push(def.promise);

			});

			when(All(defs), function(){
				console.log(JSON.stringify(index,null,4));
				d.resolve(index);
			});

		});	

	
		return d.promise;
	},


	setupStore: function(path){
		this.basePath = path;
		var _self=this;
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
			when(_self.loadIndex(), function(index){
				_self._index = index;
				def.resolve(true);
			});
		});

		return def.promise;
	},

	handleRawGit: function(repoId,url,opts){
	//	console.log("Handle Raw Git url: ",url );
	//	console.log("Handle Raw Git repoId: ", repoId);
		var def = new defer()
		url = opts.req.originalUrl;	
		var idParts = repoId.split("-");

		var lastRepoPart = idParts[idParts.length-1];
		var objectPath = Path.join(this.basePath,idParts.join("/"));	
		//console.log("Repo Path: ", objectPath);
		//console.log("url: ", url);
	//	delete opts.req.headers['accept']

		var gb = opts.req.pipe(rawGitHandler(url, function(err,service){
			if (err) {
                                console.log("RAW GIT ERR: ", err);
				if (err) return opts.res.send(err + '\n');
			}
			opts.res.set('content-type', service.type);
			//console.log("Service Type: ", service.type);
			var args =  service.args.concat([objectPath]);
			//console.log("Service Args: ", args);
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
		var subPath = opts.subPath || parts.join("/");

		var _self=this;
		if (opts && opts.rawGitRequest){
			return this.handleRawGit(opts.repoId,opts.subPath,opts);
		}

		return when(this.getRepository(id),function(repo){
			if (!repo) { return; }
			console.log("SubPath: ", subPath);
			if (!subPath){
				console.log("No SubPath, getting Metadata: ", fullId);
				return _self.getMetadata(repo,id,true);
			}
	
			console.log("Get File: ", subPath);
			return _self.getFile(repo,id,subPath);
		});
	},


	getFile: function(repo,id,filepath){
		var _self=this;
		var def = new defer();
		var filename = filepath;
		when(repo, function(repo) {
			repo.getMaster(function(error,branch) {
				if (error) { console.log("Branch Not Found"); return; def.reject("Unable to Open Master Branch: " + error); }
				branch.getTree(function(error, tree) {
					tree.getEntry(filename, function(err,entry){
						if (err || !entry) { console.log("File Not Found: ", filename); def.resolve("");return; }
						if (entry.isFile()) {
							entry.getBlob(function(err,blob) {
								if (err || !blob) { def.reject(err); }
								def.resolve({id: Path.join(id,filepath), mimeType: mime.lookup(filepath),binary: blob.isBinary(), buffer: blob.content()});
							});
						}else if (entry.isTree()){
							entry.getTree(function(err,folder) {
								when(_self.getManifestFromTree(folder,entry), function(manifest){
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

	getMetadata: function(repo,id,includeManifest){
		var _self=this;
		var def = new defer();
		when(repo, function(repo) {
			repo.getMaster(function(error,branch) {
				if (error) { console.log("Branch Not Found"); return; def.reject("Unable to Open Master Branch: " + error); }

				branch.getTree(function(getTreeError, tree) {
					if (getTreeError) { console.log("isHEAD", tree.isHead()); return def.reject(getTreeError); }
					tree.getEntry(_self.metadataFilename, function(getEntryErr,entry){
						if (getEntryErr) { console.log("getEntry: ", getEntryErr); return def.reject(getEntryErr); }
						entry.getBlob(function(getBlobErr,blob){
							if (getBlobErr) { console.log("GetBlobERR" , getBlobErr); return def.reject(getBlobErr); }	
							var metadataObject = {id:id};
							var o = blob.toString()
								
							try {
								o= JSON.parse(o);
								for (prop in o) { metadataObject[prop] = o[prop]; }
							}catch(err){
								def.reject("Unable To Parse (" + id + "): "+err);
							}
							if (includeManifest) {		
								when(_self.getManifestFromTree(tree), function(manifest){
									metadataObject.manifest = manifest;
									def.resolve(metadataObject);
								});
							}else{
								def.resolve(metadataObject);
							}
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

				entries.forEach(function(entry) {
					//console.log("Entry - Path ", entry.path(), " Name: ", entry.name(), " File: ", entry.isFile()?"True":"False");
				});

			});
		});
		return def.promse;
	
	},

	query: function(query,opts){
		//console.log("query: ", query, "data:", this._index);
		return when(ArrayQuery(query,opts,this._index),function(res){
			//console.log("Results: ", res);
			return res;
		});
	},

	post: function(obj,opts){
	//	console.log("POST: ", obj);
	//	console.log("Git Store Post: ", obj);

                if (opts && opts.rawGitRequest){
                        return this.handleRawGit(opts.repoId,opts.subPath,opts);
                }      
		var _self=this;
		var results=[]
		var defs=[]

		if (!obj.id) {
			console.log("Collection Not Found, creating new collection");
			obj.id=(opts&&opts.id)?opts.id: uuid.v4();
			opts.overwrite = false;
		}else{
			opts.overwrite = true;
		}

		return this.put(obj,opts)

	},

	getFileBuffers: function(files){
		//console.log("getFileBuffers: ", files);
		var fbs= []
		var defs = files.map(function(f){
			if (f.type=="text"){
				var c = f.content;
				if (typeof c!='string'){
					c = JSON.stringify(c);
				}
				f.buffer = new Buffer(c);	
				fbs.push(f);
				return true;
			}		
			if (f.type=="upload"){
				var def = new defer();
				if (f.tempPath) {
					fs.readFile(f.tempPath, function(err,data){
						f.buffer = data;
						fbs.push(f);
						def.resolve(true);
					});
				}else{
					console.log("Temp Path Not found for uploaded file", fs.tempPath, f)
				}
				return def.promise;
			}
			return true;
				
		});
		return when(All(defs), function(){
			return fbs;
		});
	},

	put: function(obj, opts){
		//console.log("GIT PUT OBJ: ", obj);

		if (opts.rawGitRequest) {
			return this.handleRawGit(opts.repoId,opts.subPath,opts);
		}


		var _self=this;
		var putDef = new defer();

		if (!obj.id) {
			return putDef.reject("Not Found");	
		}

		var author = (opts && opts.author)?opts.author:{name: "System", email: "system"};

		when(_self.getRepository(obj.id),function(repo){
			//console.log("Get Repo Results: ", repo);

			if (!repo) {
				repo = _self.createRepository(obj.id);
			}
			when(repo, function(repo) {
				//console.log("Got Repo: ", repo);
				var fileBuffers = [];
				if (opts.files) {
					fileBuffers = _self.getFileBuffers(opts.files);
				}

				when(fileBuffers, function(fileBuffers) {
					var metaFile = {filename: _self.metadataFilename, type: "text",buffer: new Buffer(JSON.stringify(obj)) }	
					fileBuffers.push(metaFile);

					if (!fileBuffers || fileBuffers.length < 1) {
						putDef.reject("No Content To Update");	
					}
				
					when(_self.storeUpdates(repo, obj.id,fileBuffers), function(res){
						when(_self.get(obj.id),function(obj){
							when(_self.updateIndex(obj), function(){	
								console.log("PUT res: ", obj);
								putDef.resolve(obj);
							});
						});
					});
				});
			});
		});

		return putDef.promise;
	},

	insertBuffersAsBlobs: function(repo, treeBuilder,fileBuffers){
		var defs = fileBuffers.map(function(f){
			var def = new defer();
			if (f.buffer) {
				repo.createBlobFromBuffer(f.buffer,function(blobErr,blob){
					if (blobErr){
						console.log("blobErr: ", blobErr);
						return def.reject(blobErr);
					}
					//console.log("Inserting blob at ", f.filename);
					treeBuilder.insert(f.filename,blob,0100644);
					def.resolve(true);
				});
			}else{
				console.log("No Buffer found for fileObject: ", f)
				def.resolve(true);
			}
			return def.promise;	
		});
		return All(defs);
	},

	storeUpdates: function(repo, id, fileBuffers) {
		var def = new defer();
		var _self=this;
		repo.getBranch("master", function(gitRefError, head) {
		//	if (gitRefError) {
		//		console.log("gitRefError: ", gitRefError);
		//	}
			var commitMsg = []	
			var parents=[];	
			var treeBuilder,writeRef;

			//first commit
			if (!head || gitRefError){
				treeBuilder = repo.treeBuilder();
				commitMsg.push("Initial Commit.");
				writeRef="HEAD";
			}else{
				treeBuilder = new defer();
				writeRef="HEAD";
		//		console.log("Get Commit from HEAD");
				repo.getCommit(head, function(getCommitError, parent) {
					if (getCommitError) { return treeBuilder.reject(getCommitError); }
					parents.push(parent);
					parent.getTree(function(error,tree) {
						treeBuilder.resolve(tree.builder());
					});
				});		
			}

			when(treeBuilder, function(treeBuilder){
				fileBuffers.forEach(function(fb){
					if (fb.filename=="_metadata.json") {
						commitMsg.push("Updated Collection Metadata.\n")
					}else{
						if (treeBuilder.get(fb.filename)) {
							commitMsg.push("Updated File: "+fb.filename+"\n");
						}else{
							commitMsg.push("Added New File: "+fb.filename+"\n");
						}
					}
				});
				when(_self.insertBuffersAsBlobs(repo,treeBuilder,fileBuffers),function(){
					treeBuilder.write(function(treeWriteError,treeId){
						if (treeWriteError) { throw treeWriteError; }
						var author = git.Signature.create("system", "system@system", 123456789, 60);
						var committer = git.Signature.create("system", "system@system", 987654321, 90);
						repo.createCommit(writeRef, author, committer, commitMsg.join("\n"), treeId,parents, function(commitError, commitId) {
							if(commitError) { return def.reject(commitError) }
							console.log("New Commit on ", id, commitId.sha());
							def.resolve(repo);
						});
					});
				});
			});
		});

		return def.promise;
	},

	updateIndex: function(obj){
		console.log("updateIndex: ", obj);
		if (!obj || !obj.id) { return;}
		var pos=-1;
		console.log(this);

		if (this._index[obj.id]) {
			pos = this._index.indexOf(this._index[obj.id]);
		}

		if (pos>=0) {
			//console.log("Already in index @", pos, obj.id);
			this._index[pos]=obj;
			this._index[obj.id]=obj;	
		}else{
			//console.log("Adding to index: ", obj.id);
			this._index.push(obj);
			this._index[obj.id]=obj;
		}
	},

	createRepository: function(id) {
		var filepath = Path.join(this.basePath, id.split("-").join("/"));
		console.log("Initializing new repository for " + id + " at " + filepath);
		var def = new defer();
		fs.mkdirs(filepath, function(mkdirErr){
			if (mkdirErr) { return def.reject("Unable To Create Repository Folder: ", mkdirErr); }
			git.Repo.init(filepath,true,function(err,repo){
				if (err) { return def.reject(err); }
				def.resolve(repo);
			});
		});
		return def.promise;
	},
		
	getRepository: function(id) {
		var filepath = Path.join(this.basePath, id.split("-").join("/"));
		var def = new defer();
		//console.log("Lookup repo at ", filepath);
		fs.exists(filepath, function(exists){
			if (!exists) {
				console.log("Repo directory doesn't exist: ", filepath);
				return def.resolve();
			}else{
				//console.log("Found Repository: ", filepath);
				git.Repo.open(filepath, function(err,repo){
					if (err) { return def.reject(err); }
					def.resolve(repo);
				});
			}
		});

		return def.promise;
	},

	"delete": function(id, opts){
		delete this.data[id];
		return true;
	}
});
