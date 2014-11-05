var debug = require("debug")("dme:store:solr");
var solrjs = require("solrjs");
var Deferred = require("promised-io/promise").defer;
var All= require("promised-io/promise").all;
var Sequence= require("promised-io/promise").seq;
var Query = require("solrjs/rql");
var LazyArray = require("promised-io/lazy-array").LazyArray;
var StoreBase=require("../Store");
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var declare = require("dojo-declare/declare");

var Store = module.exports = declare([StoreBase], {
	authConfigProperty: "solr",
	primaryKey: "id",
	realTimeGet: true,
	init: function(){
		debug("Creating solrjs client @ " + this.url + "/" + this.id);
		debug("clientURL", this.url + "/" + this.id)
		this.client = new solrjs(this.url + "/" + this.id,{});
		this.realTimeGet = this.realTimeGet || this.realTimeGet;	
		if (this.options && this.queryHandlers){
			this._handlers = this.queryHandlers.concat(handlers);
		}

	},
	getSchema: function(){
		debug("getSchema()");
		var propProps = ["name","type","indexed"];
		return when(this.client.getSchema(), function(response){
			debug("Client Response: ", response)
			var schema = response.schema;
			var properties = {};
			var validTypes = ["string","number","boolean","integer","array","null","object"]
			var solrTypeMap={
				"string_ci": "string",
				"tdate": "string",
				"int": "integer",
				"long": "integer",
				"float": "number",
				"text_custom": "string"
			}
			schema.fields.forEach(function(field){
				var P = properties[field.name] = {
					indexed: field.indexed
				};
				
				P.type = solrTypeMap[field.type]||field.type;

				if (validTypes.indexOf(P.type)==-1){
						P.type="string";
					}
				
				if (field.type=="tdate"){
					P.format = "datetime";
				}

				if (field.multiValued) { 
					P.type="array"
					var stype = (solrTypeMap[field.type]||field.type);
					if (validTypes.indexOf(stype)==-1){
						stype="string";
					}
					P.items = {type: stype};
					P.uniqueItems = true;
				}
	
				if (!field.stored){ P.transient = true; }
				if (field.name==schema.uniqueKey) {
					P.unique = true;
				}
			});

			var out={
				title: schema.name,
				uniqueKey: schema.uniqueKey,
				properties: properties
			}
			debug("Unique KEY", schema.uniqueKey, out)
			if (typeof schema.uniqueKey != 'undefined'){ out.required=[schema.uniqueKey] }
			debug("OUT", out)
			return out;
		}, function(err){
			debug("Error Retrieving Schema: ", err);
			return err;
		});
	},
	query: function(query, opts){
		var _self=this;
		var def = new defer();
		var query = new Query(query);
		var q = query.toSolr();
		debug("SOLR QUERY: ",q);
		return when(_self.client.query(q), function(results){
			// debug("SOLR Results:", results);
			if (results && results.response && results.response.docs) {
				return ({results: results.response.docs, metadata:{totalRows: results.response.numFound, start: (results&&results.responseHeader&& results.responseHeader.params)?results.responseHeader.params.start:0, store_responseHeader: results.responseHeader}});
			}
			return;
		});
	},

	get: function(id, opts){
		var _self = this;	
		debug("GET: ", id, opts);	

		if (this.realTimeGet) {
			return when(_self.client.get(id), function(results){
				debug("SOLR GET Results:", results);
				return {results: results.doc, metadata: {}};
			});
		}

		var pk = this.primaryKey || this.primaryKey || "id"

		if (!pk.map){
			pk=[pk];
		}

		var qs = pk.map(function(k){
			return "eq(" + k + "," + id + ")";
		}).join(",");

		
		var query = new Query("or(" + qs + ")&limit(1)");

                var q = query.toSolr();

		//debug("SOLR get() QUERY: ",q);
		return when(_self.client.query(q), function(results){
			//debug("SOLR get() Results:", results);
			if (results && results.response && results.response.docs && results.response.docs[0]) {
				return {results: results.response.docs[0], metadata:{store_responseHeader: results.responseHeader}};
			}
			return ;
		});
	}
});
	

