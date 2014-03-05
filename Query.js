var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All= require("promised-io/promise").all;
var Sequence= require("promised-io/promise").seq;
var LazyArray = require("promised-io/lazy-array").LazyArray;
var Query = require("rql/query").Query;

var LazyWalk = exports.LazyWalk = function(DME, term,opts) {
//	console.log("term: ", term);
//	console.log("stringified term: ", Query(term).toString());
	var children;

	if (term && (typeof term == 'string')){
		return term;
	}

	if  (term != 'undefined' && (typeof term == "number")) {
		return term.toString()
	}

	if (term && term instanceof Array){
		return term.join(",");
	}
	
	if (term && typeof term=="object") {
		if (term.name){
			if (term.args){
				term.args = term.args.map(function(t,index){
					return LazyWalk(DME,t,opts)
				});

				return when(All(term.args), function(args){
					if (term.name=="and" && term.args.length==1){
						return term.args[0];
					}else if (term.name=="query") {
						var modelId=args[0];
						var q= Query(args[1]);
						console.log("q: ", q);
						var query = q.toString();
						var type="public";
						console.log("typeof query: ", typeof query);
						console.log("Do Query ", modelId, query);
						if (opts && opts.req &&  opts.req.user) { 
							if (opts.req.user.isAdmin){
								type="admin"
							}else{
								type="user"
							}	
						}

						console.log(" get executor for  modelId: ", modelId, "type: ", type);
						var queryFn= DME.getModelExecutor("query", modelId, type);
						if (!queryFn) { throw new Error("Invalid Executor during LazyWalk for Query Resolver"); }
						return when(runQuery(queryFn,query,opts), function(results){
							console.log("runQuery results len: ",results.length);
							return "(" + results.join(',') + ")";
						}, function(err){
							console.log("SubQuery Error: ", err);	
						});	
					}	
					return term.name + "(" + args.join(",") + ")";
				}, function(err){
					def.reject("Error Lazily Expanding Query: ", err);
				});
			}else{
				return term.name+"()";
			}
		}
	}
	throw Error("Invalid Term - " + JSON.stringify(term));
}

var queryCache={};

function runQuery(queryFn, query,opts){
	console.log("Launch Query : ",query);
	if (queryCache[query]) {
		return queryCache[query];
	}
	return when(queryFn(query,opts),function(qres){
		queryCache[query]=qres;
		console.log("qres len: ", qres.length);
		return qres;
	});
}

exports.ResolveQuery = function(DME,query,opts) {
	//normalize to object with RQL's parser
	console.log("ResolveQuery: ", query);
	
	if (typeof query== "string"){
		query= Query(query);
	}
		
	//walk the parsed query and lazily resolve any subqueries/joins	
	return when(LazyWalk(DME, query,opts), function(finalQuery){
		//finalQuery will be a new string query	
		console.log("Final Query: ", finalQuery);
		return finalQuery;
	})
}

var Walk = exports.Walk = function(term,expansions) {
//	console.log("term: ", term);
//	console.log("stringified term: ", Query(term).toString());
	var children;

	if (term && (typeof term == 'string')){
		return term;
	}

	if  (term && (typeof term == "number")) {
		return term.toString()
	}

	if (term && term instanceof Array){
		return term.join(",");
	}

	if (term && typeof term=="object") {
		if (term.name){
			if (term.args){
				term.args = term.args.map(function(t,index){
					return Walk(t,expansions)
				});

				return when(All(term.args), function(args){
					if (term.name && expansions[name]) {
						if (typeof expansion[name]=='function') {
							return expansion[name].apply(args);
						}	
					}
					return term.name + "(" + args.join(",") + ")";
				});
			}else{
				return term.name+"()";
			}
		}
	}
	throw Error("Invalid Term - " + JSON.stringify(term));
}



exports.ExpandQuery = function(query, expansions){
	if (!expansion) {throw new Error("No Expansions Defined"); }
	//normalize to object with RQL's parser
	console.log("ResolveQuery: ", query);
	
	if (typeof query== "string"){
		query= Query(query);
	}
		
	//walk the parsed query and lazily resolve any subqueries/joins	
	return when(Walk(query,expansions), function(finalQuery){
		//finalQuery will be a new string query	
		console.log("Expanded Query: ", finalQuery);
		return finalQuery;
	})

}
