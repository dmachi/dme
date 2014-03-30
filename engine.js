var when = require("promised-io/promise").when;
var util = require('util');
var parser = require("rql/parser");
var JSONMedia = require("./media/json").Media;
var HTMLMedia = require("./media/html").Media;
var errors = require("./errors");
var EventEmitter = require("events").EventEmitter;

var DME = exports.DataModelEngine = function(dataModel,opts) {
	EventEmitter.call(this);
	this.models = dataModel;
	this.facets = {}
	this.opts = opts || {};	
	this._Models={};
	this._Stores={};
	this._Facets={};
	this.mediaHandlers = [
		HTMLMedia,
		JSONMedia
	];

	if (dataModel.send){
		this.send = dataModel.send;
		delete dataModel.send;
	}

	this.init();
}

util.inherits(DME, EventEmitter);

DME.prototype.getModelExecutor= function(method, modelId,type){
//	console.log("getModelExecutor: ", method, modelId);
//	console.log("this._Facets[modelId]", this._Facets[modelId][type]);
//	console.log("this._Models[modelId]", this._Models[modelId]);
	var fn = getExecutor(method, this._Facets[modelId][type],this._Models[modelId]);
	return fn;
}

DME.prototype.init=function(skipRegisterRoute){
	console.log("DME Init() ", arguments);
	var _self=this;
	Object.keys(this.models).forEach(function(prop){  //for (var prop in this.models){
		var M = this.models[prop];
		var opts = M.storeOpts || {};
		//console.log("DatabaseOptions: ", _self.opts.database);
		var auth = ((_self.opts.database && _self.opts.database[prop])?_self.opts.database[prop]:_self.opts.database[M.store.prototype.authConfigProperty])||{};
		opts.auth = auth;
		//console.log("DB INIT Options: ", M.collectionId?M.collectionId:prop, opts);
		this._Stores[prop] = M.Store = new M.store(M.collectionId || prop,opts);
		this._Models[prop] = M.Model =  new M.model(M.Store, this.opts);
		this._Models[prop].engine = _self;
	
		if (M.notifications){
			this._Models[prop].on('message', function(msg){
				console.log("Emitting Notification Message from DME");
				msg.model = prop;
				_self.emit('message', msg);
			});
		}
		if (M.facets){
			var facetType;
//			console.log("M.facets: ", M.facets);
			this._Facets[prop]={};
			for (facetType in M.facets){
			//	console.log("facetType: ", facetType);
				this._Facets[prop][facetType] = M.facets[facetType](M.Model, this, this.opts);
			}
		}
	
	},this);
}

DME.prototype.declareGlobal = function(prop, facet, model,scope){
//	console.log(facet, model);
	var gid = (model && model.id && model.id)?model.id:prop;
	console.log("Declare Global: ", gid);
	scope = scope || global;
	
	if (scope[gid]){
		console.warn("Schema ID or Data Model ID conflicts with existing global property, skipping (" + gid + ").");
		return;
	}
	
	//console.log("Creating Global Model And Facet References: " + gid + ", " + gid + "Facet");


	if (model) {
		console.log("Global Model Declared at : ", gid);
		scope[gid] = model 
	}

	if (facet.message || facet.user) {
		console.log("Global Message Facet Declared at " + gid + "Facet");
		scope[gid + "Facet"] = facet.message || facet.user;
	}

}

getExecutor = function(method,facet,model){
	//console.log("Method: ", method, "Facet: ", facet, "Model: ", model);
	if (facet.rpc && (facet.rpcMethods=="*" || (facet.rpcMethods.indexOf(method)>=0))){
		if (facet[method] && (typeof facet[method]=="function")){
			return function() {
				//console.log("queryFn args: ", arguments);
				return facet[method].apply(facet,arguments);
			}
			//return facet[method];
		}else if (facet[method] && (facet[method]===true) && model[method] ){
			return function() {
				//console.log("queryFn args: ", arguments);
				return model[method].apply(model,arguments);
			}
			//return model[method]	
		}
		console.log("Invalid RPC Method:", method);
		return false;	
	}
	console.log("RPC Disabled for this Facet or Facet Method", method);
	return false;
}

DME.prototype.handleMessage=function(msg,socket){
	var _self = this;
	console.log("DME Message Request: ", msg);
	var msgParts = msg.type.split("/");

	//get rid of DataModel
	msgParts.shift();

	if(msgParts.length>2){
		//console.log("Discarding Result Message: ", msg.type);
		return;
	}

	//console.log("ModelId: ", modelId);
	var modelId = msgParts[0];
	var method = msgParts[1] || "get";
	//console.log("ModelId: ", modelId);
	var facet = this._Facets[modelId].message
	var model = this._Models[model];
	var params = msg.payload.params || msg.payload;

	if (typeof params=="string"){
		params = unescape(params);
	}

	console.log("Message Params: ", params);

	var executor = getExecutor(method,facet,model);

	var routeOpts = {
		destinationId: msg.sourceId,
		responseMessageId: msg.id,
		route: (msg&&msg.route)?msg.route.reverse():undefined
	}

	if (executor){
		when(executor.apply(this, [params,routeOpts]), function(results){
			console.log("Executor Results: ",results);
			//if (facet.excludedProperties) {
			//	results = _self.filterObjectProperties(results, facet.excludedProperties);
			//}
			/*
			if (results && results.count) {
			//	if (results instanceof Array) {
					res = {}
					res.items = results.map(function(i){return i; });
					res.count = results.count;
					res.start = results.start;
					res.end = res.start + res.count;
					results=res;
			//	}
			}
			*/
			console.log("Send Executor Results: ", results);
			_self.send("DataModel/" + modelId +  "/" + method + "/result",results,routeOpts);
		}, function(error){
			console.log("Executor Error Handler", error);
			_self.send("DataModel/" + modelId +  "/" + method + "/error",{error: 500, message: "Error Executing RPC Method: " + error},routeOpts);
		}) 
	}else{
		console.log("No Executor");
		_self.send("DataModel/" + modelId +  "/" + method + "/error",{error: 404, message: "Unabled to Find or Access RPC Method: " + method},routeOpts);

	}	
	
//	console.log("Message Request: ", req);	
}
DME.prototype.getMiddleware=function(opts) {
	var _self=this;
	
	return [
		// extract http_* and set those as http headers
		function(req,res,next){
			if (req.query) {
				for (param in req.query){
					if (param.match("http_")){
						//console.log("param: ", param, req.query[param]);
						var rp = "" + param + "=" + req.query[param];
						var p = param.split("_");
						p.shift();
						var p = p.join("_");	
						req.headers[p]=req.query[param];
						delete req.query[param];
						req._parsedUrl.search = req._parsedUrl.search.replace("&"+rp,"");
						req._parsedUrl.search = req._parsedUrl.search.replace(rp,"");
						req._parsedUrl.query = req._parsedUrl.query.replace("&"+rp,"");
						req._parsedUrl.query = req._parsedUrl.query.replace(rp,"");
					}
				}

			}
			next();
		},
/*
		function(req, res, next) { 
                        console.log('-- session in dme engine.js--'); 
                        console.dir((req && req.session)?req.session:"\tNo Session");
			console.log("req: ", req.session);
                        console.log('-------------');
                        next()
                },
*/
		//check auth and choose the correct facet for this request
		function(req,res,next){

			if (req.isAuthenticated && req.isAuthenticated()){

				if (req.user && req.user.isAdmin){
					req.facet = req.facet["admin"];
				}else{
					req.facet = req.facet["user"];
			}
			}else{
				req.facet = req.facet["public"];
			}
	
			next();
		},

		function(req,res,next){
			//console.log("Check Store Method");
			var m = req.storeMethod = req.method.toLowerCase();
			//console.log("m: ", m, "req.body.method", req.body.method);
			if ((m=="get") && (!req.params['id'])){
				m=req.storeMethod="query";
			}else if ((m=="post")&&(req.body.jsonrpc)){
				req.storeMethod="rpc"
			}

			//console.log("REQ Store Method: ", req.storeMethod);
			next();
		},

			//set a templateId
		function(req,res,next){
			//console.log("Check Headers");
			req.templateId = req.model;

			if (req.storeMethod == "query") {
				req.templateId=req.model + "-list";
			}

			if (req.headers && req.headers.templateStyle){
				req.templateId = req.templateId + "-" + req.headers.templateStyle;
			}
		

			next();
		},


		// parse the query string (as rql) 
		function(req,res,next){
			var limiter,start,end,limit;
			var limit = Infinity;//TODO: should come from model, 
			var requestedLimit;
			var start = 0;
			var maxCount=Infinity;
//			console.log("q: ", q);
			var q= req&&req._parsedUrl&&req._parsedUrl.query?unescape(req._parsedUrl.query):"";
//			var q = req._parsedUrl.query;
			req.originalQuery = req._parsedUrl.query;	
			//console.log("Process Range Header: ", req.headers);	

			if (req.headers.range) {
				var range = req.headers.range.match(/^items=(\d+)-(\d+)?$/);
				//console.log("range: ", range);
				if (range) {
					start = range[1] || 0;
					end = range[2];
					end = (end !== undefined) ? end : Infinity;

					if (end && (end !== Infinity) && (typeof end != "number")) {
						end = parseInt(end);
					}	
					if (start && typeof start!= "number") {
						start= parseInt(start);
					}	
	
					// compose the limit op
					if (end > start) {
						requestedLimit = Math.min(limit, end  - start);
						// trigger totalCount evaluation
						maxCount = Infinity;
					}else if (end==start){
						requestedLimit=1
					}
				}
			}
			//console.log("requestedLimit: ", requestedLimit, "start: ", start, "maxCount", maxCount);		
			if (requestedLimit) {
				req.limit = {start: start, limit: requestedLimit}
				limiter= "&limit(" + requestedLimit+ "," + start + "," + maxCount + ")";
				q += limiter;
			}else{
				req.limit={start: start||0, limit: Infinity}
			}
			//console.log("Pre-Parse: ", q);
			var parsed;
			if (q) {
				parsed = parser.parse(q);
			}else{
				parsed="";
			}
/*
			if (!requestedLimit && parsed && parsed.cache && parsed.cache.limit) {
				if (limit!=Infinity) {
					requestedLimit = parsed.cache.limit[0]||limit;
					limiter= "&limit(" + requestedLimit+ "," + start + "," + maxCount + ")";
					req.limit = {start: start, limit: requestedLimit}
					q += limiter;
				}
				parsed = parser.parse(q);
			}
*/

			req.query = parsed;
			//console.log("re.query: ", req.query);
//			console.log("query: ", q);
			next();
		},

		function(req,res,next) {
			var httpMethod = req.method;
			var storeMethod = req.storeMethod;
		
			//console.log("checking storeMethod: ", storeMethod);	
			//console.log("req.params: ", req.params, "req.query: ", req.query);
			req.storeParams = req.params.id || req.params[0];
			if (storeMethod=="post" || storeMethod=="put"){
				req.storeParams = req.body || {};
			}else if (storeMethod=="query") {
				req.storeParams = req.query;
			}
			next();
		},

		function(req,res,next){
			var httpMethod = req.method;
			var storeMethod = req.storeMethod;

			//console.log("Endpoint: ",req.model);
			if (!req.facet[storeMethod] && !((req.facet.rpcMethods=="*")||(req.facet.rpcMethods&&(req.facet.rpcMethods.indexOf(storeMethod)>=0))) ){
				//console.log("req.facet[storeMethod]: ", req.facet[storeMethod], req.model[storeMethod], req.facet);
				return next("route");
			}

			//console.log('req.facet: ', req.facet);
			if (req.facet[storeMethod]===true){
				//console.log("Found StoreMethod");
				if (storeMethod=="rpc") {
					//console.log("Handle RPC");
					var params = req.body;
					//console.log("Requested RPC Params: ", params);
					//console.log("Allowed RPC Methods: ", req.facet.rpcMethods);	
					if((req.facet.rpcMethods=="*")||(req.facet.rpcMethods&&(req.facet.rpcMethods.indexOf(params.method)>=0))){
						console.log("RPC Call: ",params.method, params.params);
						var fn = function(p){
								//console.log("RPC Call");
							//console.log("Facet: ", req.facet[params.method]);		
							//console.log("Model: ", req.dataModel);		
							var e = req.facet[params.method]?req.facet:req.dataModel;

							if ((e===req.facet)&&(req.facet[params.method]===true)){
								e = req.dataModel;
							}
							req.rpc = params;
							//console.log("Handler: ", (e===req.dataModel)?"Model":"Facet");
							var ret;	
							if (params.params instanceof Array){
								//console.log("params: ", params, "req.params:", req.params);
								var z =  params.params.concat([{req:req,res:res}]);
								if (req.params && req.params.length>0) {
									var zz = [].concat(req.params).concat(z);
									z=zz;
								}
								ret = e[params.method].apply(e, z);
							}else{
								ret = e[params.method](params.params,{req:req,res:res});
							}
							return ret;
						}
					}else{
						console.log("Access to RPC Method: '", params.method, "' is forbidden."); 
						throw errors.Forbidden("Account does not have access to the '" + params.method + "' RPC method");
					}
					try {
						res.results = fn(req.storeParams, {req: req, res:res});
					}catch(err){
						console.log("Error Executing RPC: ", err);
						res.results = err;
					}
				}else{
					//console.log("Default Handler: ", req.model, storeMethod);
					if (req.dataModel[storeMethod]){

						if (storeMethod=="query") { 
							p = req.query 
						} else {
							var p = req.params.id || req.params[0];
						}
						//console.log("p: ", p, req.query);
						try {
							res.results = req.dataModel[storeMethod](p, {req: req, res: res});
						}catch(err){
							res.results = err;
						}
					}
				}
			}else if (typeof req.facet[storeMethod]== "function"){
				//console.log("storeMethod: ", storeMethod);
				//console.log("Custom Facet Handler");
				//console.log("req.body: ", req.body);
				//console.log("req.params-b: ", req.storeParams);
				//console.log("Store Method Func: ", req.facet[storeMethod]);
				try {
					res.results = req.facet[storeMethod](req.storeParams, {req: req, res: res});

				}catch(err){
					//console.log("res.results initial: ", res.results);
					res.results = err;
				};
			}
			
			when(res.results, function(results){
//				console.log('res.results_2 length: ', results.length);
				if (results && results.stream) {
					return;
				}	
				if (results instanceof Error){
//					console.log("Found Error: ", results);
					res.error=results;
				}
				res.results=results;
				next();
			}, function(err){
				res.error=err;
				next();
			});
	
		},

		function(req, res, next){
			 when(res.results, function(results){
//				console.log("rpc check", results); 
				//if we're processing an rpc call, just return results
				//the rpc method is responsible for filtering any resultant properties
//				console.log("res.results processing: ", results, arguments);
				if (results && results.stream) {  return; }
				//console.log("results: ", results);
				if (!results && (results!==false)){
					throw errors.NotFound("No Results Found");
					next("route");
				}
				if (results && (results.file || results.buffer || results.stream)){
				//	res.download(res.results.file);
					next();
					return;
				}	

				if (req.storeMethod=="rpc"){

					var r = {
						jsonrpc: "2.0",
						id: req.rpc.id,
					}
					if (results instanceof Error){
						r.code=-32000;
						r.message = results.message;
						r.data= {stack: results.stack};
					}else{
						r.result=results
										
					}

					res.set("content-type","application/json");
					res.send(200, JSON.stringify(r));
					return;
				}

				if (req.facet.excludedProperties){
					if (results.forEach){
						res.results = results.map(function(o){
							return _self.filterObjectProperties(o,req.facet.excludedProperties);
						});			
					}else{
						res.results = _self.filterObjectProperties(results, req.facet.excludedProperties);
					}
				}
				//res.results = results;
				next();
				
			});/*, function(e){
				console.log("Facet Call error: ", e);
				//res.send(e.status||500, e.name, e.toString());
				next("route");
			});*/
		},


		function(req,res,next){
//			console.log("res.results: ", res.results);
			when(res.results, function(results){
				if (res.totalCount && res) {
					//console.log("Got Total Count: ", res.totalCount);
					res.set("content-range", "items=" + ((req && req.limit)?req.limit.start:0) + "-" + (((req&&req.limit)?req.limit.start:0)+results.length) + "/" + (res.totalCount));	
				}
				next();
			});	
		}, 
		function(req,res,next){
//			console.log("res.results: ", res.results);
			when(res.results, function(results){
//				console.log("RES.RESULTS FINAL MIDDLEWARE: ", results);
				if (results && results.file){
					console.log("Send Download File: ", results.file);
					res.sendfile(results.file,  function(err){
						console.log("Error sending file inline: ", err);
					});
					return;
				}

				if (results && results.buffer) {
					if (results.mimeType) {
						res.set("content-type", results.mimeType);
					}
					res.send(200,results.buffer);
					return;
				}

				if (results && results.stream) {
					//console.log("results.stream: ", !!results.stream);
					return;
				} else if (res.error) {
					console.log("Result Error: ", res.error);
					if (res.error.status){
						res.send(res.error.status,res.error.message);
					}
				}else{	
					var mediaHandlers = {}
					_self.mediaHandlers.map(function(h){
						mediaHandlers[h.mimeType] = function(obj){
							//console.log("Serialize type: ", h.mimeType);
							//console.log("Serializing: ", results);
							//console.log("results.totalCount:", res.totalCount, " results len: ", results?results.length:"None");
							var out = h.serialize(results,{req: req, res: res})
							when(out, function(out){
//								console.log("out: ", out);
								res.send(out);
							});/*, function(err){
								next("route");
							});*/
						}
					})
					//console.log("Media Handlers: ", mediaHandlers);
					res.format(mediaHandlers);
				}		
			}, function(err){
				console.log("Error Handling Results: ", err);
				res.render("error", {results: res.results, error: err});
	//			next();
				next(err);	

			})
		}
	]
}

DME.prototype.registerRoute=function(endpoint,facet,model,expressApp){
	var _self=this;
	console.log("Registering route: ", endpoint);
	var app = expressApp;
	if (!app) { console.error("Unable to register routes"); return; }

	app.all("/" + endpoint + "/:id(*)"  , function(req, res, next){
//		req.params.id = (req.params.id)?req.params.id.substr(1):"";
		req.model=endpoint;
		req.dataModel = model;
		req.facet = facet; 
		console.log("Request for ", endpoint, " Method: ", req.method, req.params.id);
		next();
	}, this.getMiddleware());

	app.all("/" + endpoint + "$"  , function(req, res, next){
		req.model=endpoint;

		req.dataModel = model;
		req.facet = facet; 
		console.log("Request for Model:", endpoint, " Method: ", req.method);
		next();
	}, this.getMiddleware());
}

DME.prototype.filterObjectProperties=function(obj, excluded){
	var filtered = {}
	for (prop in obj){
		if (!excluded || (excluded.indexOf(prop)==-1)){
			filtered[prop]=obj[prop];
		}
	}
	return filtered;	
}
	
DME.prototype.handleResults=function(req,res,next){
	var _self=this;
	if (res.results.stream) { return res.results; }
	when(res.results, function(results){
		//console.log("Results: ", results);
		//console.log("handle results type: ", typeof results);
		//console.log("AcceptHeader: ", req.headers["accept"]);
		if (res.results && res.results.file){
			console.log("DOWNLOAD FILE: ", results.file);
			res.sendfile(results.file);
			return next("route");
		}
		var mediaHandlers = {}
		_self.mediaHandlers.map(function(h){
			mediaHandlers[h.mimeType] = function(obj){
				var out = h.serialize(results,{req: req, res: res})
				when(out, function(out){
//					console.log("out: ", out);
					res.send(out);
				}, function(err){
					next("route");
				});
			}
		})
		//console.log("Media Handlers: ", mediaHandlers);
		res.format(mediaHandlers);
					
	}, function(err){
		console.log("Error Handling Results: ", err);
	//	res.render("error", {results: res.results, error: err});
		return res.results;
	})
	
}
DME.prototype.registerExpressRoutes=function(expressApp){
	console.log("Register Express Routes.");
	var _self=this;
	for (prop in this.models){
		this.registerRoute(prop, this._Facets[prop], this._Models[prop],expressApp);
	}
	expressApp.get("/schema/:id"  , function(req, res, next){
		if (_self.models[req.params.id]){
			res.send(_self.models[req.params.id].Model.schema);
		}else{
			throw errors.NotFound("Schema Not Found");
		}
	});

	expressApp.get("/schema"  , function(req, res, next){
		var schema={};
		for (prop in _self.models){
			schema[prop]=_self.models[prop].Model.schema;
		}
		res.send(schema);
	});

}

DME.prototype.setupGlobals = function(scope){
	console.log("Setup Globals");
	for (prop in this.models){
		this.declareGlobal(prop,this._Facets[prop],this._Models[prop], scope);
	}

}

DME.prototype.get=function(modelId){
	return this._Models[modelId];	
}

