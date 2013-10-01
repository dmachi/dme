var parser = require("rql/parser");

exports.Store = function(options){
	options=options||{}
	for (prop in options) {
		this[prop]=options[prop];
	}
}

exports.Store.prototype = {
	setSchema: function(schema){
		this.schema=schema;
	},
	parseQuery: function(query,opts){
	},
	get: function(id,opts){
	},
	query: function(query, opts){
	},
	put: function(obj, opts){
	},
	delete: function(id, opts){
	}
}
