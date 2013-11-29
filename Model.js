var errors = require("./errors");
var when = require("promised-io/promise").when;
var EventEmitter = require('events').EventEmitter;
var util=require("util");

var Model = exports.Model= function(store,opts){
	EventEmitter.call(this);
	var _self=this;
	this.store = store;
	this.opts = opts;
	this.setSchema(this.schema);

}

util.inherits(Model,EventEmitter);

Model.prototype.setSchema=function(schema){
	var _self=this;
	this.schema=schema;
	for (prop in this.schema){
		if (typeof this.schema[prop] == 'function'){
			this[prop]=this.schema[prop];
		}
	}
	_self.store.setSchema(schema);	

}
Model.prototype.get=function(id,opts){
	console.log("Call Store Get: ", id, "store id", this.store.id);
	return this.store.get(id,opts);
}
Model.prototype.query=function(query, opts){
	return this.store.query(query, opts);
}
Model.prototype.put=function(obj, opts){
	return this.store.put(obj,opts);
}
Model.prototype.post=function(obj, opts){
	return this.store.post(obj,opts);
}
	
Model.prototype.delete=function(id, opts){
	return this.store.delete(id,opts);
}

Model.prototype.rpcMethods=[];
Model.prototype.rpc=false;
Model.prototype.allowedOperators="*"

