var when = require("promised-io/promise").when;
var parser = require("rql/parser");
var JSONMedia = require("./media/json").Media;
var HTMLMedia = require("./media/html").Media;
var errors = require("./errors");

var DME = exports.DataModelEngine = function(model,facets,app,opts){
	this.models = model;
	this.facets = facets;
	this.app = app;
	this.opts = opts || {};	
	this._Models={};
	this._Stores={};
	this._Facets={};
	this.mediaHandlers = [
		HTMLMedia,
		JSONMedia
	];

	console.log("Setting up Data Model Engine: ", this.model, this.facets, this.opts);
	this.setupExpressRoutes();
}

DME.prototype = {
	getMiddleware: function(){

		//parse query with RQL parser and put parsed data into req.query
		return function(req,res,next){
			if (req.query) {
				for (param in req.query){
					if (param.match("http_")){
						console.log("Param: ", param);
						var p = param.split("_");
						p.shift();
						var p = p.join("_");	
						console.log("p: ", p, req.query[param]);
						req.headers[p]=req.query[param];
						delete req.query[param];
					}
				}

			}


			var q= req._parsedUrl.search;
			if (q && q.charAt(0)=="?"){
				q = q.substr(1);
			}
			
			if (q) {		
				req.query =  parser.parse(q);
			}else{
				req.query ="" 
			}

			if (req.isAuthenticated || req.isAuthenticated()){
				if (req.user.isAdmin){
					req.facet = "admin";
				}else{
					req.facet = "user";
				}
			}else{
				req.facet = "public";
			}

			next();	
		}	
	},
	registerRoute: function(endpointId, httpMethod, route,facet,model, method){
		console.log("Registering Route: ", httpMethod, route, method);
		var _self=this;
		method=method||httpMethod;
		var handler = [this.getMiddleware(),
			function(req,res,next){
				if (method=="query") {
					req.templateId=endpointId + "-list";
					return next();
				}

				console.log("model.id: ", model.id, model);
				console.dir(model);
				req.templateId = endpointId;
				console.log("Using Template: ", req.templateId);	
				next();
			}
		]
		handler.push(function(req,res,next){
			var params;
			if (method=="query"){
				params=req.query;
			}else{
				params=req.params.id;
			}

			if (httpMethod=="post" || httpMethod=="put"){
				params = req.body;

				if (httpMethod=="post"){
					if (params.jsonrpc && params.jsonrpc=="2.0"){
						method="rpc";
					}
				}
				console.log("POST PARAMS: ", req.body, typeof req.body);
		
			}
		
			console.log("Facet Method: ", method);	
			var fn;
//			console.log("Call:",facet[req.facet], httpMethod, method, params ); 
			if (req.facet && facet[req.facet]&&facet[req.facet][method]){
				if (typeof facet[req.facet][method] === 'function'){
					fn = facet[req.facet][method];
				}else if (facet[req.facet][method]===true){
					console.log("Facet Default Handler ", method);
					if (method=="rpc") {
						console.log("Requested RPC Method: ", params.method);
						console.log("Allowed RPC Methods: ", facet[req.facet].rpcMethods);	
						if((facet[req.facet].rpcMethods=="*")||(facet[req.facet].rpcMethods&&(facet[req.facet].rpcMethods.indexOf(params.method)>=0))){
							console.log("Create RPC Call: ",params.method, params.params);
							fn = function(p){
//								try {
									var e = facet[req.facet][params.method]?facet[req.facet]:model;

									if ((e===facet[req.facet])&&(facet[req.facet][params.method]===true)){
										e = model;
									}
								//	console.log("Handler: ", (e===model)?"Model":"Facet", e);
									if (params.params instanceof Array){
										return e[params.method].apply(e, params.params.concat([{request:req,response:res}]));
									}else{
										return e[params.method](params.params,{request:req,response:res});
									}
//								}catch(err){
//									return err;
//									console.log("Caught Error: ", err);
//								}
							}
						}else{
							console.log("Access to RPC Method: '", params.method, "' is forbidden."); 
							throw errors.Forbidden("Account does not have access to the ' + params.method + ' RPC method");
						}
					}else{
						fn = function(p){
							return model[method](p,req);
						}
					}
				}
			}else{
				res.status=404;
				return next();
	
			}
		
			if (fn){
				res.results=when(fn(params, {request:req,response:res}), function(results){
					//if we're processing an rpc call, just return results
					//the rpc method is responsible for filtering any resultant properties
					console.log("res.results processing: ", results, arguments);
					if (!results && (results!==false)){
						throw errors.NotFound("No Results Found");
						next("route");
					}

					if (res.results && res.results.file){
						res.download(res.results.file);
						return next("route");
					}

					if (method=="rpc"){
						console.log("RPC Results: ", results);
						var r = {
							jsonrpc: "2.0",
							id: params.id,
						}
						if (results instanceof Error){
							r.code=-32000;
							r.message = results.message;
							r.data= {stack: results.stack};
						}else{
							r.result=results
											
						}
						return r;
					}

					if (facet[req.facet].excludedProperties){
						if (results.forEach){
							return results.map(function(o){
								return _self.filterObjectProperties(o,facet[req.facet].excludedProperties);
							});			
						}
					}

					res.results = _self.filterObjectProperties(results, facet[req.facet].excludedProperties);
					console.log('when() results filtered');
					next();
					
				}, function(e){
					console.log("Facet Call error: ", e);
					//res.send(404, e.name, e.toString());
					next(e);
				})
			}
		})

		handler.push(function(req,res,next){
			_self.handleResults(req,res,next);
		});


		console.log("httpMethod: ", httpMethod);
		this.app[httpMethod](route,handler);
	},

	filterObjectProperties: function(obj, excluded){
		var filtered = {}
		for (prop in obj){
			if (!excluded || (excluded.indexOf(prop)==-1)){
				filtered[prop]=obj[prop];
			}
		}
		return filtered;	
	},
	
	handleResults: function(req,res,next){
		var _self=this;
		console.log("res.results: ", res.results);
		when(res.results, function(results){
			console.log("Results: ", results);
			console.log("handle results type: ", typeof results);
			console.log("AcceptHeader: ", req.headers["accept"]);
			if (res.results && res.results.file){
				console.log("do download", results.file);
				res.sendfile(results.file);
				return next("route");
			}
			var mediaHandlers = {}
			_self.mediaHandlers.map(function(h){
				console.log("handler: ", h);
				
				mediaHandlers[h.mimeType] = function(obj){
					var out = h.serialize(results,{request: req, response: res})
					when(out, function(out){
						console.log("out: ", out);
						res.send(out);
					}, function(err){
						next("route");
					});
				}
			})
			console.log("Media Handlers: ", mediaHandlers);
			res.format(mediaHandlers);
						
		}, function(err){
			console.log("Error Handling Results: ", err);
		//	res.render("error", {results: res.results, error: err});
			return res.results;
		})
		
	},

	setupExpressRoutes: function(){
		var _self=this;
		for (var prop in this.models){
			var M = this.models[prop];
			this._Stores[prop] = M.Store = new M.store(prop,this.opts.database[M.store.prototype.authConfigProperty]);
			this._Models[prop] = global[prop] = M.Model =  new M.model(M.Store, this.opts);
			if (M.facets){
				var facetType;
				console.log("M.facets: ", M.facets);
				this._Facets[prop]={};
				for (facetType in M.facets){
					console.log("facetType: ", facetType);
					this._Facets[prop][facetType] = M.facets[facetType](M.Model, this.opts);
				}

				var checkMethods=["get","query","delete", "put","post","rpc"];

				var methods = checkMethods.filter(function(method){
					var facetType;
					for (var facetType in this._Facets[prop]){
						if (this._Facets[prop][facetType][method]){
							return true;
						}
					}
				},this);	

				methods.forEach(function(method) {
					var httpMethod=method;
					if (method=="query") { httpMethod="get";}
					if (method=="rpc") { httpMethod="post"; }

					var route = "/" + prop + "/";
					if ((httpMethod=="get" && method!="query") || httpMethod=="delete") {
							route += ":id";	
					}


//					var route = "/" + prop + ((method=="query")?"/":"/:id");
					this.registerRoute(prop, httpMethod, route, _self._Facets[prop], _self._Models[prop], method);
				}, this);			
			}
		}	
	},

	get: function(modelId){
		return this._Models[modelId];	
	}
}
