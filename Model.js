var errors = require("./errors");

exports.Model= function(store,opts){
	var _self=this;
	this.store = store;
	this.opts = opts;

	if (!store) { throw Error("No Store Provided to Data Model"); }

	this.setSchema(this.schema);

}

exports.Model.prototype = {
	setSchema: function(schema){
		var _self=this;
		this.schema=schema;
		for (prop in this.schema){
			if (typeof this.schema[prop] == 'function'){
				this[prop]=this.schema[prop];
			}
		}
		_self.store.setSchema(schema);	

	},	
	get: function(id,opts){
		return this.store.get(id,opts);
	},
	query: function(query, opts){
		return this.store.query(query,opts);
	},
	put: function(obj, opts){
		return this.store.put(obj,opts);
	},
	post: function(obj, opts){
		return this.store.post(obj,opts);
	},
	
	delete: function(id, opts){
		return this.store.delete(id,opts);
	},

	rpcMethods:[],
	rpc:false,
	allowedOperators: "*"
}
