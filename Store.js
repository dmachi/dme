var parser = require("rql/parser");
var EventEmitter = require('events').EventEmitter;
var util=require("util");

var Store = exports.Store = function(options){
	EventEmitter.call(this);
	this.options=options;
}

util.inherits(Store, EventEmitter);

Store.prototype.setSchema=function(schema){
	this.schema=schema;
}

Store.prototype.parseQuery=function(query,opts){
}

Store.prototype.get=function(id,opts){
	return this.store.get(id, opts);
}

Store.prototype.query=function(query, opts){
	return this.store.query(query, opts);
}

Store.prototype.put=function(obj, opts){
	return this.store.put(obj, opts);
}

Store.prototype.delete=function(id, opts){
	return this.store.delete(id, opts);
}

