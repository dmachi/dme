var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var declare = require("dojo-declare/declare");
var PrivilegeFacet = require("./PrivilegeFacet");

module.exports = declare([PrivilegeFacet],{
	model : null,
	permissive: true,
	maxLimit: 100,
	defaultLimit: 25,
	allowedOperators: "*" 
});
