var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var declare = require("dojo-declare/declare");
var introspect = require("introspect");

module.exports = declare([],{
	model : null,
	permissive: false,
	maxLimit: 100,
	defaultLimit: 25,
	allowedOperators: "*", 

	constructor: function(wrapper){
		for (prop in wrapper) {
			this[prop]=wrapper[prop];
		}

		if (this.model) { this.init(); }
	},
	
	init: function(){
		console.log("Privilege Facet Init");
                this._smd = this.model.getServiceDescription();
		console.log("this._smd: ", this._smd);
                var services = this._smd.services;

		if (this.permissive) {
	                Object.keys(services).forEach(function(method){
				if (typeof this[method] == 'undefined'){
					this[method] = function(){
						return this.model[method].call(this.model,arguments);
					}
				}
			},this);
		}else{
			Object.keys(services).forEach(function(method){
				console.log("Checking Method: ", method);
				if (this[method] === true){
					console.log("\tFound Method Enabled");
					this[method] = function(){
						return this.model[method].call(this.model, arguments);	
					}
				}else if (typeof this[method]=='function'){
					console.log("\tFound Method Override Function");
					var params = introspect(this[method])
					if (params[params.length-1]=="/*expose*/") {
						this.smd.services[method] = {
							type: "method",
							parameters: []
						}

						console.log("Expose Function: ", method);
						var svcParams = params.forEach(function(p,idx) { 
							if (!p.match(/\/\*/)){
								if (params[idx+1] && params[idx+1].match(/\/\*/) && params[idx+1]!="/*expose*/"){
									var type = params[idx+1].replace("/*","").replace("*/","");
							
									this._smd.services[method].parameters.push({name: p, type: type});
								}else{
									this._smd.services[method].parameters.push({name: p});
								}
							}
						},this);
	
						console.log("svcParams: ", svcParams);
					}else{
						console.warn("Facet Method Exists for " + method + "but does not include an /*exposed*/ comment");
					}	
				}else{
					console.log("\tNot Found remove from Facet SMD");
					delete services[method];
				}
			},this);
		}
        },

	use: function(model){
		if (!model) { throw new Error("Model Missing"); }
		this.model=model;
		this.init();	
	},

        getSchema: function(){
		var self=this;
                if (this.schema) {
			return this.schema;
		}else {
			return when(this.model.getSchema(), function(schema){
                                // override visible properties in the schema
				//  properties can be:
				//	With a string or array the behavior is the same for both permissive and non-permissive faets

				//	a string: "*"  to allow all properties
				//      array: ["foo","bar*"]  an array of property names or patterns to allow

				//	With an object on a permissive facet, properties simply override or added to the schema from the model
				//	On a non-permissive facet, only those properties listed are available.
						
				// 	object: { foo: {...}, bar: {...} } 	
				if (self.properties && (self.properties != "*")) {
				
					Object.keys(schema.properties).forEach(function(prop){
						if (self.properties instanceof Array) {
							if (!self.properties.some(function(p){
								return prop.match(p);	
							})){
								delete schema.properties[prop];	
							}
						}else if (self.properties[prop] === false) {
							delete schema.properties[prop];
						}else if (self.properties[prop] === true ){
							// don't do anyting just keep this property
						}else if (self.properties[prop] && typeof self.properties[prop]=='object'){
							schema.properties[prop]=self.properties[prop];
						}else if (!self.permissive){
							delete schema.properties[prop];
						}
					});
				}

				self.schema = schema;
				return schema;
			}, function(err){
				console.log("Error Filtering properties in Facet schema",err);
				return;
			});
		}
        },

	getServiceDescription: function(){
		return this._smd;
	},

        get: function(id,opts /*expose*/){
		if (this.permissive) {
	                return this.model.get.call(this.model,arguments);
		}
		throw new Error("Not Allowed");
        },

        query: function(query, opts /*expose*/){
		if (this.permissive) {
                	return this.model.query.call(this.model,arguments);
		}
		throw new Error("Not Allowed");
        },

        put: function(obj, opts /*expose*/){
		if (this.permissive) {
                	return this.model.put.call(this.model,arguments);
		}
		throw new Error("Not Allowed");
        },

        post: function(obj, opts /*expose*/){
		if (this.permissive) {
	                return this.model.post.call(this.model,arguments);
		}
		throw new Error("Not Allowed");
        },

        'delete': function(id, opts /*expose*/){
		if (this.permissive) {
	                return this.model['delete'].call(this.model,arguments);
		}
		throw new Error("Not Allowed");
        }
});
