var StoreBase=require("../Store").Store;
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ArrayQuery = require("rql/js-array").query;

var Store = exports.Store= function(id,options){
	this.id = id;
	this.opts = options;
	this.data={}
	this._countID=111111;
}

util.inherits(Store, StoreBase);

Store.prototype.get = function(id,opts){
	return this.data[id];
}

Store.prototype.query=function(query,opts){
	return ArrayQuery(query,opts,this.data);
}

Store.prototype.post=function(obj,opts){
	if (obj.id){
		for (prop in obj){
			this.data[id][prop] = obj[prop];
		}
	}else{
		return this.put(obj,opts);
	}
	return obj;
}

Store.prototype.put=function(obj, opts){
	if (!obj.id){
		obj.id=this._countID++;
	}

	this.data[obj.id]=obj;	
	return obj;
}

Store.prototype.delete=function(id, opts){
	delete this.data[id];
	return true;
}
