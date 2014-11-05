var debug = require("debug")("dme:facet:restrictive");
var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;

var RestrictiveFacet = module.exports = function(model, implementation){
	this.model = model;
	this.properties={}
	this.links = [];

	var copyProps = ["$schema","title","description","pathStart","id","type","required"];

	copyProps.forEach(function(prop){
		if (this.model[prop]){
			this[prop] = this.model[prop];
		}
	},this)

	if (implementation){
		Object.keys(implementation).forEach(function(prop){
			if (implementation[prop]===true && (typeof this.model[prop] == 'function')){
				this[prop] = function(p1,p2) { 
					return this.model[prop].apply(this.model,arguments); 
				}
			}else if (prop=="properties"){
				if (implementation.properties===true){
					this.properties=this.model.properties;
				}else{
					debug("Copying Implementation Properties");
					Object.keys(implementation.properties).forEach(function(p){
						if ((implementation.properties[p]===true) && this.model.properties && this.model.properties[p]){
							this.properties[p]=this.model.properties[p]
						}else{
							this.properties[p]=implementation[properties[p]]
						}
					},this);
				}
			}else if (prop=="links"){
				if (implementation.links===true){
					debug("Copy links", this.model.links);
					this.links=this.links.concat(this.model.links);
				} else if (implementation.links instanceof Array){
					debug("Found Implementation Links Array")
					this.links = implementation.links;
				} else if (typeof implementation.links == "object"){
					debug("Links Object")
					if (implementation.links.includedRelations){
						if (implementation.links.includedRelations == "*"){
							this.links = [].concat(this.model.links);
						}else{
							this.model.links.forEach(function(link){
									if (implementation.links.includedRelations.indexOf(link.rel)>=0){
										this.links.push(link);
									}
							},this)
						}

						if (implementation.links.excludedRelations){
							this.links = this.links.filter(function(link){
								if (implementation.links.excludedRelations.indexOf(link.rel)>=0){
									return false;
								}
								return true;
							})
						}
					}
				}
				debug("this links", this.links);
			}else{
				debug("Copy Implementation Property")
				this[prop]=implementation[prop];
			}
		},this);
	}else{
		console.debug("No Implementation Provided for facet")
	}


}


