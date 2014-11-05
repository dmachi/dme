var debug = require("debug")("dme:datamodel");
var util = require("util");
var events = require("events");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var Path = require('path');
var URL = require('url');
var Query = require("rql/query").Query;
var Model = require("./model");
var fs = require("fs-extra");
var Request = require('request');
var express = require('express');
var mw = require("./middleware");
var Path = require("path");
var URL = require("url");
var MW = require("./middleware");

var DataModel = function(model) {
	this.model={}
	events.EventEmitter.call(this);

	Object.keys(model).forEach(function(key){
		this.model[key]=model[key];
	},this)

	this.setupRouter();
}

util.inherits(DataModel, events.EventEmitter);

DataModel.prototype.setupRouter = function(){
	var router = express.Router();
	router.route("*").all([
		MW["http-params"],

		MW["model"],

		function(req,res,next){
			debug("Response Metadata:", res.metadata)
			if (res.metadata){
				if (res.metadata['content-type']){
					res.set("content-type",res.metadata['content-type']);
				}
				console.log(" Has Range", res.metadata.totalRows || res.metadata.start, "body len", res.body.length);
				if (res.metadata.totalRows || res.metadata.start){
					var rangeHeader ="items " + parseInt(res.metadata.start||0) + "-" + (parseInt(res.metadata.start||0) + parseInt(res.body.length))+ "/";
					rangeHeader += res.metadata['totalRows'] || ""
					console.log("range Header", rangeHeader)
					res.set("content-range", rangeHeader);
				}
			}
			next();
		},
		
		MW["media"].serialize,

		function(req,res,next){
			debug("Write Serialized Body")
			if (res.body){
				res.status(200);
				res.end(res.body)
			}
		}
	]);

   	// catch 404 and forward to error handler
	router.use(function(req, res, next) {
	    var err = new Error('Not Found');
	    err.status = 404;
	    next(err);
	});

    router.use(function(err,req,res,next){
    	if (err){
    		console.log("Got route error: ", err)
			res.status(err.status || 500);
        	res.render('error', {
            	message: err.message,
            	error: err
        	});
    	}
    })

    this.router = router;
}

DataModel.prototype.match = function(req) {
	var url = req.url;
	debug("match()", url)
	return this.getModels().some(function(model){
		if (model.pathStart){
			var match = req.url.match(model.pathStart);

			if (match && match.index===0){
				req.model = model;
				return true;
			}
		}
	})
}

DataModel.prototype.dispatch = function(req,res,next){
	this.router(req,res,next);
}

DataModel.prototype.use = function(){
	this.router.use(this.router,arguments);
}

DataModel.prototype.getModels = function(){
	return Object.keys(this.model).map(function(key){
		// debug("key: ",key, this.model[key])
		return this.model[key];
	},this)
}

DataModel.prototype.get = function(name) {
	return this.model[name];
}

DataModel.prototype.exists = function(name){
	return !!this.model[name];
}

module.exports = DataModel;
