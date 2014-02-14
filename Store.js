var parser = require("rql/parser");
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var declare = require("dojo-declare/declare");

var store = exports.Store = declare([EventEmitter], {
	constructor: function(id, options) { 
		console.log("Options: ", options);
		this.id = id;
		this.options=options;
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

