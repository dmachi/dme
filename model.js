var debug = require("debug")("dme:model")
var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var EventEmitter = require('events').EventEmitter;
var util = require("util");
var SchemaRegistry = require("./SchemaRegistry").SchemaRegistry;

//var JS = new JaySchema(JaySchema.loaders.http);


var Model = module.exports = function(name, schema, store, implementation) {
	this.id = name;
	// debug("Declare New Model: ", name, schema, store, implementation, facets)
	//mixin the schema

	this.store = store;
		
	if (schema) {
		Object.keys(schema).forEach(function(prop) {
			this[prop] = schema[prop]
		}, this)
	}

	SchemaRegistry.register(this,name);
	
	if (implementation) {
		Object.keys(implementation).forEach(function(prop) {
			this[prop] = implementation[prop]
		}, this)
	}

	debug("Validating Model Schema...")
	SchemaRegistry.validate(this,{"$ref":"http://json-schema.org/draft-04/hyper-schema"},function(errs){
		if (errs){
			console.warn("Error Validating the '" + name + "' Model");
			return;
		}
		debug("Schema is valid")
	})
	
}

util.inherits(Model, EventEmitter);

function getProp(obj, parts){
	var cur = obj;
	parts.forEach(function(p){
		if (cur[p]){
			cur = cur[p];
		}
	})
	return cur;
}

Model.prototype.getReference=function(ref){
	if ((typeof ref=="object") && ref["$ref"]){
		ref = ref["$ref"];
	}else if (typeof ref=="object"){
		console.log("Object is not a reference: ", ref);
		return ref;
	}
	if (ref=="#") { return this }

	var rp = ref.split("#")
	var schemaName;
	if (rp[0]){
		schemaName=rp[0]
	}
	var internal = rp[1].split("/");
	if (!schemaName){
		return getProp(this,internal);
	}else{
		debug("external to schema ref");
	}
}

Model.prototype.getLinks = function(facet) {


	debug("Model.getLinks()", this);
	return this.links;

	if (this.facets && this.facets !== false && this.facets[facet] && this.facets[facet].links) {
		return this.facets[facet].links;
	}else if (!this.facets && this.facets !== false) {

		console.log("Got _schema links:", this.links)

		return this.links;
		// links.forEach(function(link) {
		// 	if (link && link.targetSchema && link.targetSchema["$ref"]) {
		// 		debug("Resolve Reference", link.targetSchema)
		// 		var resolved = this._schema.resolveURI(link.targetSchema)
		// 		debug("Resolved: ", resolved)
		// 	}
		// }, this)

		return links;

	}
	return []
}

Model.prototype.query=function(query,options){
	return this.store.query(query,options)
}

Model.prototype.get=function(id,options){
	debug("Model get()", id)
	return this.store.get(id,options)
}

Model.prototype.post=function(obj,options){
	return this.store.post(obj,options)
}

Model.prototype.put=function(obj,options){
	return this.store.put(obj,options)
}

Model.prototype.delete=function(id,options){
	return this.store.delete(id,options)
}

