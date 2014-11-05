var debug = require("debug")("dme:middleware:model");
var Path = require("path");
var uriTemplate = require("uri-templates");
var SchemaRegistry = require("../SchemaRegistry").SchemaRegistry;
var Media = require("../media");
var when = require('promised-io/promise').when;
var defer = require("promised-io/promise").defer;
var URL = require("url");
var uriTemplate = require("uri-templates");	
var rangeParser = require("range-parser");
var errors = require("../errors");

var matchModel = function(params,query, model, method, contentType){
	var pathStart = model.pathStart;

	debug("MatchModel: ", params, query, model.id, method, contentType)
	var links = model.links;
	debug("links",links)
	var pathStartMatches = params.match(pathStart);
	debug("PathStartMatches: ", pathStartMatches);
	if (!pathStartMatches || pathStartMatches.index>0){
		debug("PathStart Does not match: ", pathStart)
		return false;
	}

	var matched;
	debug("Check rel links", links.map(function(l){ return l.rel}), params)
	links.some(function(link){
		debug("Link Check: ", link.href, params, "Link Method: ", link.method, " req method: ", method);
		if (link.method && link.method.toLowerCase()!=method.toLowerCase()){
			debug("Link method did not match.")
			return false;
		}

		if (link.encType && link.encType!=contentType){
			debug("Request Content-Type did not match link.encType")
			return false
		}
		var ms;
		var ms = params.match(link.href);
		if (ms && ms.index===0){
			debug("Matched link.href: ", link.href, " to ", params, "model.rel type: ", typeof model[link.rel], " ms: ", ms )
			if (model[link.rel] && typeof model[link.rel]=='object' && model[link.rel].links){
				var nextParams = params.replace(model.pathStart,"");
				debug("Next Params", nextParams);
				var m = matchModel(nextParams,query, model[link.rel], method, contentType);
				if (m) { matched = m};
				return true;
			}else if (typeof model[link.rel]=='function'){
					var ut = new uriTemplate(link.href);
					var input = ut.fromUri(params);
					debug("fromUri: ", input)

					var emptyParams = ut.varNames.filter(function(varName){
						return !input[varName];
					})
					debug("emptyParams", emptyParams);

					if (emptyParams.length>0){
						debug("Missing Params: ", emptyParams)
						return false;
					}

					if (ut.varNames.length>0){
						var inputParams = ut.varNames.map(function(varName){
							return input[varName];
						})
					}

					debug("Input Params pre", params, inputParams, query, link.href )
					if (!inputParams || inputParams.length<1){
						inputParams = [query];
					}
					debug("Input Params: ", inputParams)
				debug("Found Execution REL");
					matched={link: link, model: model, params: inputParams}
				return true;
			}else{
				debug("Link did not match: ", link.rel, " ", link.href);
				return false;
			}
		}else if ((typeof model[link.rel]=='function')||(link.rel=="self")){
			debug("Check for matched by function/self link")
			var ut = new uriTemplate(link.href);
			var input = ut.fromUri(params);
			debug("fromUri: ", input)

			var emptyParams = ut.varNames.filter(function(varName){
				return !input || !input[varName];
			})
			debug("emptyParams", emptyParams);

			if (emptyParams.length>0){
				debug("Missing Params: ", emptyParams)
				return false;
			}
			var inputParams = ut.varNames.map(function(varName){
				return input[varName];
			})

			matched={link: link, params: inputParams, model: model}
			debug("execution rel input", inputParams)
			return true;
		}
		debug("Link did not match: ", link.rel, link.href);
		return false;
	})

//	debug("return Matched Links: ", matched)
	return matched;
}

module.exports = [

	function(req, res, next) {
		debug("matchModel Middleware", req.params, req.method)
		var params = req.params[0];

		var matched = matchModel(params,req.query, req.model, req.method, req.headers['content-type']);

		if (!matched) { next("route"); }

		req.matchedLink = matched.link;
		req.params = matched.params;
		req.model = matched.model;
		req.execMethod = (matched.link.rel=="self")?"get":matched.link.rel;
		next();
	},

	function(req,res,next){
			var range = req.range(/*req.model.maxLimit||1000*/);
			if (range && range[0]){
					var count = range[0].end - range[0].start
					if (count && (req.execMethod.match("^query") || req.execMethod.match("^search"))){
						req.params[0] = req.params[0] += "&limit(" + count + "," + (range[0].start) + ")";
					}
			}else if (req.execMethod=="query"){
				req.params[0]=req.params[0] += "&limit(" + (req.model.maxLimit||25) + "0)";
			}
			debug("post limit req.params[0]", req.params[0]);
			next();
	},

	function(req,res,next){
		debug("Executing", req.execMethod, req.params)
		if (!req.model || !req.model[req.execMethod]){
			console.error("Model Method not found", req.execMethod);
		}
		debug("Execution Param (sans options): ", req.params);
		req.params.push({req: req,res:res});

		var modelResponse = req.model[req.execMethod].apply(req.model,req.params)
		when(modelResponse, function(mr){
			if (mr instanceof Error){
				next(mr);
			}else if (typeof mr == 'object'){
				res.body = mr.results;
				res.metadata = mr.metadata;
				next();
			}else{
				next(new errors.InternalServerError())
			}
		});
	}
]