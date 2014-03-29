var errors = require("./errors");
var when = require("promised-io/promise").when;
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var declare = require("dojo-declare/declare");

var Model = exports.Model= declare([EventEmitter],{
	store: null,
	constructor: function(store,opts){
		var _self=this;
		this.store = store;
		this.opts = opts;
		this.setSchema(this.schema);
	},

	updateObject: function(object,updated){
		console.log("Update Obj");
		var _self=this;
		var out = {};
		if (object.id) { out.id = object.id }
		if (!this.schema || !this.schema.properties) { throw Error("Missing Schema Properties"); }
		Object.keys(this.schema.properties).forEach(function(prop){
			var propDef = _self.schema.properties[prop];
			console.log("prop: ", prop, "propDef: ", propDef);
			if (!prop || (prop=="id") || (typeof propDef=="function")) { return; }

			if ((propDef.type=="readonly")&&(typeof object[prop]!="undefined")){
				out[prop]=object[prop];
			}
		
			if (propDef.type=="transient"){
				return;
			}

			if ((typeof object[prop]=="undefined") && (typeof updated[prop]=='undefined') && (!propDef.optional) ){
				if (propDef['default']) { out[prop]=propDef['default'];  return }
				throw new errors.NotAcceptable("'" + prop + "' is a required property.");
			}else if (!updated[prop] && object[prop]) {
				out[prop]=object[prop];
			}else if (updated[prop]){
				out[prop]=updated[prop];
			}else{
				console.log("Property Not Defined: ", prop);
			}

			if (propDef['enum'] && updated[prop] && (propDef['enum'].indexOf(updated[prop])==-1)){
				throw new errors.NotAcceptable("'" + prop + "' must be one of: " + propDef['enum'].join(", "));
			}
			
			if (propDef.type && out[prop]) {
				console.log("Check out[prop] as ", propDef.type, propDef, typeof out[prop]);
				var udType = typeof out[prop];
				
				if (propDef.type=="date") {
					if (!(out[prop].toISOString)){
						throw new errors.NotAcceptable("'" + prop +"' expected to be of type " + propDef.type + ", but was " + udType); 
					}
				} else if (propDef.type != udType){
					throw new errors.NotAcceptable("'" + prop +"' expected to be of type " + propDef.type + ", but was " + udType); 
				}
			}

			if (propDef.validation && out[prop]) {
				if (typeof propDef.validation == 'string'){
					propDef.validation = new RegExp(propDef.validation);
				}

				if (propDef.validation instanceof RegExp){
					if (!out[prop].match(propDef.validation)){
						throw new errors.NotAcceptable("'" + prop + "' did not pass validation.  Invalid value: " + out[prop]);
					}
				}else if (typeof propDef.validation=='function'){
					if (!propDef.validation(out[prop])){
						throw new errors.NotAcceptable("'" + prop + "' did not pass validation.  Invalid value: " + out[prop]);
					}
				}	
			}
		});


		//copy any properties that weren't part of the schema onto the output object from the original object
		Object.keys(object).filter(function(prop){
			if (_self.schema[prop]) { return false; }
			return true;
		}).forEach(function(prop){
			out[prop]=object[prop];
		});

		//copy any properties that weren't part of the schema onto the output object from the updatedObject, overwriting
		//those props if they had been set by the above.  Properties beginning with _ are treated as transient properties
		//and dropped that this point

		Object.keys(updated).filter(function(prop){
			if (prop.charAt(0)=="_") { return false; }
			if (_self.schema[prop]) { return false; }
			return true;
		}).forEach(function(prop){
			out[prop]=updated[prop];
		});

		return out;	
	},

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
		console.log("Call Store Get: ", id, "store id", this.store.id);
		return this.store.get(id,opts);
	},
	query: function(query, opts){
		return this.store.query(query, opts);
	},
	put: function(obj, opts){
		return this.store.put(obj,opts);
	},
	post: function(obj, opts){
		return this.store.post(obj,opts);
	},
	
	'delete': function(id, opts){
		return this.store.delete(id,opts);
	},
	rpcMethods: [],
	rpc: false,
	allowedOperators: "*"
});
