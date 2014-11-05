var parser = require("rql/parser");
var EventEmitter = require('events').EventEmitter;
var declare = require("dojo-declare/declare");

var store = module.exports = declare([EventEmitter], {
	constructor: function(id, options) { 
		this.id = id;
		options = options || {}

		Object.keys(options).forEach(function(key){ this[key]=options[key]; }, this);
		this.init();
	},
	"setSchema":function(schema){
		this.schema=schema;
	},
	"parseQuery": function(query,opts){
		// IMPLEMENT IN SUBCLASS		
	},

	"get":function(id,opts){
		// IMPLEMENT IN SUBCLASS		
	},

	"query":function(query, opts){
		// IMPLEMENT IN SUBCLASS		
	},

	"put":function(obj, opts){
		// IMPLEMENT IN SUBCLASS		
	},

	"delete": function(id, opts){
		// IMPLEMENT IN SUBCLASS		
	}
});

