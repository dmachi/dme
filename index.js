var express = require('express');
var router = express.Router();
var URL = require("url");
var querystring = require("querystring");
var bodyParser = require("body-parser");
var findBestMedia = require("./media").findBestMedia;
var when = require("promised-io/promise").when;
var All = require("promised-io/promise").all;

var middleware = [
	// Parse the query string, extract http_* parameters to set as headers
	// set req.query to the resultant unparsed querystring
	function(req,res,next){
		var url = URL.parse(req.originalUrl,false,false); 

		if (url.query) {
			var parsed = querystring.parse(url.query);
			Object.keys(parsed).forEach(function(key){
				if (key.match("http_")) {
					var header = key.split("_")[1];
					req.headers[header] = parsed[key];
					var regex = new RegExp("[&]" + key + "=" + parsed[key]);
					url.query = url.query.replace(regex,"");
				}
			});
			req.query = url.query; 
		}else{
			req.query="";
		}

		next();
	},
	function(req,res,next){
		req.apiPrivilegeFacet="public";
		next();
	}
]


serializationMiddleware = [
	function(req,res,next){
		if (res.results) {
			res.media = findBestMedia(req.headers.accept || "text/json",res.results,{req:req,res:res});	
			res.set("content-type",res.media['content-type']);
			console.log("Serialize to ", res.media['content-type']);
			var serialized = res.media.serialize(res.results, {req:req,res:res});
			when(serialized, function(out) {
				res.end(out);
			});
		}else{
			console.log("No Results Found.");
			next("route");		
		}
	}
]

module.exports = function(dataModel){

	router.use(middleware);

	router.get('/resource/schema/:id', [
		function(req,res,next){
			req.templateId = "schema";
			console.log("req.params: ", req.params);
			if (req.params.id) {
				var model = dataModel.model[req.params.id];
				if (model) {
					when(model.getSchema?model.getSchema():(model.schema||{id: req.params.id}),function(schema){
						res.results={results: schema, metadata:{}};
						next();
					}, function(err){
						console.error("Error Retrieving Schema for " + req.params.id);
						next(err);
					});	
				}else{
					console.error("Invalid Model when trying to retrieve schema " + req.params.id);
					next("route");
				}
			}
		},
		serializationMiddleware

	]);

	router.get('/resource/schema', [
		function(req,res,next){
			req.templateId = "schema";
			console.log("req.params: ", req.params);
			req.templateStyle="list"
			var schemas=[]

			var defs = Object.keys(dataModel.model).map(function(modelId){
				var model = dataModel.model[modelId];
				return when(model.getSchema?model.getSchema():(model.schema||{id: req.params.id,target: "/" + modelId}),function(schema){
					schemas.push(schema);
					return true;	
				}, function(err){
					return false;
				});	

			});

			when(All(defs), function(){
				var url = URL.parse(req.originalUrl,false,false); 
				
				var schema = {
					id: req.protocol + "://" + req.host + (req.port?(":"+req.port):"") + url.pathname + "#",
					description: "Root API Schema"
				}	
				schemas.forEach(function(s){
					schema[s.title] = s;
					s.id = "#" + s.title;
				});
				res.results={results: schema, metadata:{}};
				next();
			},function(err){
				console.log("Error Retrieving Schema: ", err);
				next(err);
			});
		},
		serializationMiddleware

	]);

	router.get('/resource/smd/:id', [
		function(req,res,next){
			console.log("req.apiPrivilegeFacet: ", req.apiPrivilegeFacet);
			console.log("Model: ", req.params.id);
			console.log(" facets instance: ", dataModel.privilegeFacet[req.params.id], dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet]);

			if (req.apiPrivilegeFacet && req.apiPrivilegeFacet!="model" && dataModel.privilegeFacet[req.params.id] && dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet]){
				console.log("SMD Provider (facet): ", req.params.id, req.apiPrivilegeFacet);
				req.smdProvider = dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet];
			}else {
				console.log("SMD Provider (model): ", req.params.id);
				req.smdProvider = dataModel.model[req.params.id];
			}

			next();	
		},
		function(req,res,next){
			req.templateId = "smd";
			if (req.params.id) {
				var model = dataModel.model[req.params.id];
				if (model) {
					console.log("Get Service Description ", req.params.id);
					when(req.smdProvider.getServiceDescription(),function(smd){
						console.log("Service Description: ", smd);
						smd.target = "/" + req.params.id;
						res.results={results: smd, metadata:{}};
						next();
					}, function(err){
						console.error("Error Retrieving Service Mapping Description for " + req.params.id);
						next(err);
					});	
				}else{
					console.error("Invalid Model when trying to retrieve SMD" + req.params.id);
					next("route");
				}
			}
		},
		serializationMiddleware

	]);

	router.get('/resource/smd', [
		function(req,res,next){
			req.templateId = "smd";
			console.log("req.params: ", req.params);
			var SMD = {
				transport: "RAW_POST",
				envelope: "JSON-RPC-2.0",
				contentType: "application/json"	,
				target: "/"
			}
	
			var smds={}

			var defs = Object.keys(dataModel.model).map(function(modelId){
				var smdProvider;
	                        if (req.apiPrivilegeFacet && req.apiPrivilegeFacet!="model" && dataModel.privilegeFacet[modelId] && dataModel.privilegeFacet[modelId][req.apiPrivilegeFacet]){
					smdProvider = dataModel.privilegeFacet[modelId][req.apiPrivilegeFacet];
				}else {
					smdProvider = dataModel.model[modelId];
				}

				return when(smdProvider.getServiceDescription(),function(smd){
					smds[modelId]=smd;

					if (!smd.target || !smd.target.match("/")){
						smds[modelId].target = modelId;	
					}
			
					Object.keys(SMD).forEach(function(key) { if (smds[modelId][key] == SMD[key]) { delete smds[modelId][key]; } });
				
					console.log("SMD Target: ", smd.target);	
					return true;	
				}, function(err){
					return false;
				});	

			});

			when(All(defs), function(){
				var url = URL.parse(req.originalUrl,false,false); 

				var smd = {
					transport: "RAW_POST",
					envelope: "JSON-RPC-2.0",
					contentType: "application/json"	,
					target: "/",
					services: smds
				}
	
				res.results={results: smd, metadata:{}};
				next();
			},function(err){
				console.log("Error Retrieving SMD: ", err);
				next(err);
			});
		},
		serializationMiddleware

	]);


	router.get('/:model/:id', [
		function(req, res,next) {
			req.apiModel = req.params.model;
			req.templateId = req.apiModel;
			req.apiMethod = "get";
			req.apiParams=[req.params.id];
			req.apiOptions = querystring.parse(req.query);
			next();	
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.get('/:model/', [
		function(req,res,next){
			req.apiModel = req.params.model;
			req.templateId = req.apiModel;
			req.templateStyle = 'list';
			req.apiMethod="query";
			console.log("req.query: ", req.query);
			req.apiParams=req.query?[req.query]:[];
			req.apiOptions = {};
			next();
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	console.log("bodyParser:", bodyParser);
	router.post('/:model[/]',[
		bodyParser.json({limit: 20000}),
		function(req,res,next) {
			req.apiModel = req.params.model;
			if (req.body.jsonrpc){
				req.headers.accept="application/json+jsonrpc";
				console.log("req.body: ", JSON.stringify(req.body),req.headers);
				if (req.body.method) {
					req.apiMethod=req.body.method;
					req.apiParams = req.body.params || [];
					req.apiOptions = {}
				}else{
					next(Error("Missing JSONRPC Method"));
				}
			}else{
				req.apiMethod="post";
				req.apiParams = req.body;
				req.apiOptions = {};
			}
			next();
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.put("/:model/:id", [
		function(req,res){
			bodyParser.json({limit: 20000})
		},
		dataModel.middleware
	]); 

	return router;
}

