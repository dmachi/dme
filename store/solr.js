var debug = require("debug")("dme:store:solr");
var solrjs = require("solrjs");
var Deferred = require("promised-io/promise").defer;
var All= require("promised-io/promise").all;
var Sequence= require("promised-io/promise").seq;
var Query = require("solrjs/rql");
var LazyArray = require("promised-io/lazy-array").LazyArray;
var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var declare = require("dojo-declare/declare");
var Store = exports.Store = declare([StoreBase], {
	authConfigProperty: "solr",
	primaryKey: "id",
	realTimeGet: true,
	init: function(){
		debug("Creating solrjs client @ " + this.options.url + "/" + this.id);
		this.client = new solrjs(this.options.url + "/" + this.id,{});
		this.realTimeGet = this.options.realTimeGet || this.realTimeGet;	
		if (this.options && this.options.queryHandlers){
			this._handlers = this.options.queryHandlers.concat(handlers);
		}

	},
	getSchema: function(){
		debug("getSchema()");
		var propProps = ["name","type","indexed"];
		return when(this.client.getSchema(), function(response){
			var schema = response.schema;
			var properties = {};

			var solrTypeMap={
				"string_ci": "string",
				"tdate": "date",
				"int": "integer"
			}
			schema.fields.forEach(function(field){
				var P = properties[field.name] = {
					indexed: field.indexed
				};
				
				P.type = solrTypeMap[field.type]||field.type;
				
				if (field.multiValued) { 
					P.type="array"
					P.items = {type: field.type};
					P.uniqueItems = true;
				}
	
				if (!field.stored){ P.transient = true; }
				if (field.name==schema.uniqueKey) {
					P.unique = true;
				}
			});

			return {
				title: schema.name,
				uniqueKey: schema.uniqueKey,
				properties: properties,
				required: [schema.uniqueKey]
			}
		}, function(err){
			console.log("Error Retrieving Schema: ", err);
			return err;
		});
	},
	query: function(query, opts){
		var _self=this;
		var def = new defer();
		var query = new Query(query);
		var q = query.toSolr();
		//console.log("SOLR QUERY: ",q);
		return when(_self.client.query(q), function(results){
			//console.log("SOLR Results:", results);
			return ({results: results.response.docs, metadata:{totalRows: results.response.numFound, start: (results&&results.responseHeader&& results.responseHeader.params)?results.responseHeader.params.offset:0, store_responseHeader: results.responseHeader}});
		});
	},

	get: function(id, opts){
		var _self = this;	
		//console.log("GET: ", id, opts);	

		if (this.realTimeGet) {
			return when(_self.client.get(id), function(results){
				//console.log("SOLR GET Results:", results);
				return {results: results.doc, metadata: {}};
			});
		}

		var pk = this.options.primaryKey || this.primaryKey || "id"

		if (!pk.map){
			pk=[pk];
		}

		var qs = pk.map(function(k){
			return "eq(" + k + "," + id + ")";
		}).join(",");

		
		var query = new Query("or(" + qs + ")&limit(1)");

                var q = query.toSolr();

		//console.log("SOLR get() QUERY: ",q);
		return when(_self.client.query(q), function(results){
			//console.log("SOLR get() Results:", results);
			return ({results: results.response.docs, metadata:{totalCount: results.response.numFound, store_responseHeader: results.responseHeader}});
			if (results && results.response && results.response.docs && results.response.docs[0]) {
				return {results: results.response.docs[0], metadata:{store_responseHeader: results.responseHeader}};
			}
			return ;
		});
	}
});
	

