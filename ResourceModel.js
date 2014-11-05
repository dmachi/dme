var debug = require("debug")("dme:ResourceModel");

var ResourceModel = module.exports = function(name, DataModel){
	this.dataModel = DataModel;
	this.name = name;
	this.pathStart = "/" + name;
}

ResourceModel.prototype.properties = {
	"schema": {
		"type": "object",
		"description": "Data Model Schemas",
		"pathStart": "schema",
		"links": [{
			"rel": "getSchema",
			"href": "{id}",
			"method": "GET",
			"template": "default"
		},{
			"rel": "self",
			"href": "/",
			"method": "GET",
		}]
	},

	"smd": {
		"type": "object",
		"description": "Data Model Schemas",
		"pathStart": "smd",
		"links": [{
			"rel": "getSMD",
			"href": "{id}",
			"method": "GET",
			"template": "default"
		},{
			"rel": "querySMD",
			"href": "smd{?query*}",
			"method": "GET",
			"template": "default-list"
		}]
	}
}



ResourceModel.prototype.getLinks = function(){
	return [
		{
			"rel": "self",
			"href": "{resource}",
			"method": "GET"
		},
		{
			"rel": "schema",
			"href": "{resource}",
			"method": "GET"
		},
		{
			"rel": "smd",
			"href": "{resource}",
			"method": "GET"
		},

	]
}

ResourceModel.prototype.get = function(id,opts){
	debug("ResourceModel get()", id);
	return {results:{dataModel: id},metadata: {}}
}

ResourceModel.prototype.query = function(query,opts){
	return [{dataModel: "foo"}]
}


ResourceModel.prototype.getSchema = function(id,opts){
	debug("ResourceModel getSchema()", id);
	return {results:{dataModel: id},metadata: {}}
}

ResourceModel.prototype.querySchemas = function(query,opts){
	debug("ResourceModel getSchema()", query);
	return [{dataModel: "foo"}]
}


ResourceModel.prototype.getSMD = function(id,opts){
	debug("ResourceModel getSMD()", id);
	return {results:{dataModel: id},metadata: {}}
}

ResourceModel.prototype.querySMD = function(query,opts){
	debug("ResourceModel getSchema()", query);
	return [{dataModel: "foo"}]
}
