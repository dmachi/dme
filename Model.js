var debug = require("debug")("dme:model")
var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var declare = require("dojo-declare/declare");
var introspect = require("introspect");

var Model = exports.Model= declare([EventEmitter],{
	store: null,
	constructor: function(store,opts){
		var _self=this;
		this.store = store;
		this.opts = opts;
	},

	generateSchema: true,
	getSchema: function(){
		if (this.generateSchema && this.store && this.store.getSchema){
			if (!this._generatedSchema){
				debug("Build Schema");
				return this.buildSchema();
			}else{
				debug("_generatedSchema");
				return this._generatedSchema;
			}
		}

		return this.schema;
	},

	buildSchema: function(){
		debug("buildSchema");
                var def = new defer();
                var self=this;
                when(this.store.getSchema(), function(schema){
                        self._generatedSchema  = schema;
                        Object.keys(self.schema).forEach(function(prop){
                                if ((prop != "properties")&& typeof self.schema[prop] != 'undefined'){
                                        self._generatedSchema[prop]=self.schema[prop];
                                }
                        });
                        def.resolve(self._generatedSchema);
                }, function(err){
                        def.reject(err);
                })

                return def.promise;
        },


	getServiceDescription: function(){
		var smd = {
			transport: "RAW_POST",
			envelope: "JSON-RPC-2.0",
			contentType: "application/json"	,
			services: {}	 	
		}

		for (var prop in this) {
			if (typeof this[prop] == 'function') {
				var params = introspect(this[prop])
				if (params[params.length-1]=="/*expose*/") {
					smd.services[prop] = {
						type: "method",
						parameters: []
					}

					//debug("Expose Function: ", prop);
					var svcParams = params.forEach(function(p,idx) { 
						if (!p.match(/\/\*/)){
							if (params[idx+1] && params[idx+1].match(/\/\*/) && params[idx+1]!="/*expose*/"){
								var type = params[idx+1].replace("/*","").replace("*/","");
						
								smd.services[prop].parameters.push({name: p, type: type});
							}else{
								smd.services[prop].parameters.push({name: p});
							}
						}
					});


					//debug("svcParams: ", svcParams);
				}	
			}
		}
		this.serviceDescription = smd;

		return this.serviceDescription;
	},

	updateObject: function(object,updated){
		var _self=this;
		var out = {};
		if (object.id) { out.id = object.id }
		if (!this.schema || !this.schema.properties) { throw Error("Missing Schema Properties"); }
		Object.keys(this.schema.properties).forEach(function(prop){
			var propDef = _self.schema.properties[prop];
			//debug("prop: ", prop, "propDef: ", propDef);
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
				//debug("Property Not Defined: ", prop);
			}

			if (propDef['enum'] && updated[prop] && (propDef['enum'].indexOf(updated[prop])==-1)){
				throw new errors.NotAcceptable("'" + prop + "' must be one of: " + propDef['enum'].join(", "));
			}
			
			if (propDef.type && out[prop]) {
				//debug("Check out[prop] as ", propDef.type, propDef, typeof out[prop]);
				var udType = typeof out[prop];
				
				if (propDef.type=="date") {
					//debug("Date Property: ",prop, out[prop]);
					if (typeof out[prop]=="string"){
						//debug("Convert ISO String to Date Object");
						out[prop]=new Date(Date.parse(out[prop]));
						//debug("Converted: ", out[prop]);
					}

					if (!(out[prop].toISOString)){
						throw new errors.NotAcceptable("'" + prop +"' expected to be of type " + propDef.type + ", but was " + udType); 
					}
				} else if ((propDef.type=="array") && (udType=="object" ) && ((out[prop] instanceof Array)||(out[prop].forEach))) {
					// do nothing		
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
		_self.store.setSchema(schema);	
	},
	get: function(id,opts /*expose*/){
		debug("Call Store Get: ", id, "store id", this.store.id);
		return this.store.get(id,opts);
	},
	query: function(query, opts /*expose*/){
		return this.store.query(query, opts);
	},
	put: function(obj, opts /*expose*/){
		return this.store.put(obj,opts);
	},
	post: function(obj, opts /*expose*/){
		return this.store.post(obj,opts);
	},
	
	'delete': function(id, opts /*expose*/){
		return this.store.delete(id,opts);
	},
	rpc: false,
	allowedOperators: "*"
});
