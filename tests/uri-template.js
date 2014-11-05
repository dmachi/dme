var URITemplate = require('uri-templates');

var pathStart = "/foo";

var JaySchema = require('jayschema');
var SchemaRegistry = new JaySchema(JaySchema.loaders.http);
SchemaRegistry.addFormat("productId", function(value){ if (!value || value.match(/\?/)){ return "invalid product id"} return null });
//console.log("SchemaRegistry: ", SchemaRegistry);
var getObjSchema= {
	type: "object",
	properties: {
		"params": {
			"oneOf": [
				{"type": "string",format: "productId"},
				{
					"type": "array",
					"items": {type: "string","format": "productId"}
				}	
	
			]		
		}
	},
	required: ["params"]
}

var getQuerySchema= {
	type: "object",
	properties: {
		"params": {
			"oneOf": [
				{"type": "string"},
				{
					"type": "array",
					"items": {type: "string"}
				}	
			],
		}
	},
	required: ["params"]

	
}

var templates = [
	["get()","[/]([^?]+)",getObjSchema],
	["query()","\\?(.*)",getQuerySchema]
	//["Query","{/params*}{?params,params*}",getQuerySchema]
]



var urls = [
	"/foo",
	"/foo/",
	"/foo/?",
	"/foo/someId",
	"/foo/someId/someSubId",
	"/foo/someId,someOtherId",
	"/foo/someId/someSubId,someOtherId/someOtherSub",
	"/foo/someId?someParam=blah",
	"/foo/someId/someSubId?someParam=blah",
	"/foo/?eq(foo,bar)",
	"/foo?eq(foo,bar)",
	"/foo/?foo=bar",
	"/foo?foo=bar",
	"/foo/?eq(foo,bar)&eq(baz,boz)",
	"/foo?eq(foo,bar)&eq(baz,boz)",
	"/foo/?eq(foo,bar)&baz=boz",
	"/foo?eq(foo,bar)&baz=boz",

]

templates.forEach(function(template){
//	var t = new URITemplate(pathStart + template[1]);
	urls.forEach(function(url){
		//var out = t.fromUri(url);
//		console.log("Testing: ", url, "Pattern: ", template[1]);
		var matches = url.replace(pathStart,"").match(template[1]);
//		console.log("Matches: ", matches);
//		var params = matches[1];
		if (matches) {
		//	console.log("Matches: ", matches);
			params=matches[1]
			console.log("\t\t MATCH: href: ", template[0] + "  "  + url + " Params: ", params);
		}else{
//			console.log("\tNOT MATCHED: ", template[0] + " " + url);	
		}
/*
		SchemaRegistry.validate(out,template[2],function(errs){
//			console.log("errs: ", errs);
			if (errs){
				return;
			}
			console.log("href: ", template[0] + "  "  + url+ " Parsed: ", JSON.stringify(out), " WOULD BE MATCHED"); 
		})
*/
	});
});
