#Data Model Engine (DME)

DME is an provide an API engine for ExpressJS 4.x (http://expressjs.com).

DME allows developers to define Models and PrivilegeFacets.  The DME middleware uses these
to provide a REST API, JSON-Schema data definitions, and Service Mapping Descriptions (SMD).  By default,
the standard REST Verbs (get, post, put, head, delete) are provided both directly and via JSON-RPC.  

Additional Model methods may be exposed and are then available via JSON-RPC.  Both the Model's Schema and SMD
are automatically generated based on a the Model and PrivilegeFacet.  PrivilegeFacets all different classes
of users (e.g., public, user, admin) to be have different levels of access and visibility into the API and data 
objects.  

The previous version of DME was for ExpressJS 3.x.  The current one is under development and not all of the
stores have yet been ported. 

## Installation

- npm install dme

## Usage


	// get some modules
	var app = module.exports =  express();
	var DataModel = require("dme/DataModel");
	var engine = require("dme");
	var RestrictiveFacet = require("dme/RestrictiveFacet");

	// define and require a Model
	var MyModel = require("./mymodel").Model;

	// Create a new DataModel which contains all the models for this app.
	var dataModel = new DataModel()

	// load in the default media handlers (js,html,text)
	require("dme/media/");

	//Create a Store that we want to back our model
	var store = new SolrStore("products",{url: "http://localhost:8983/solr", primaryKey: "productId"});

	// instantiate the model passing in the store and any options
	var model = new MyModel(store,{});


	// instantiate a privilege facet 
	var publicFacet = new RestrictiveFacet({
		query: function(query,opts){
			query += "&eq(publicProduct,true)";
			return this.model.query(query,opts);
		}	
	});

	// Add the new Model and Facets into the DataModel at "products"
	dataModel.set("products",model, {public: publicFacet});

	/* 
	... app middleware ...
	*/

	// Add in the DME engine middleware along with your other routes
	// It will claim /:products  and /resource  in this case

	app.use(engine(dataModel))	 


##Example Data Model

	var Model = exports.Model = declare([ModelBase], {
	        primaryKey: "genome_id",

		// this is the base portion of the schema
		// for a solr store the data schema is retrieved from solr
		// and mixed in with the schema, the exposed models from the store and here

		schema: {
	                "description": "Example Schema"
		},

		doSomething: function(foo /*string*/,bar /*bar*/ /*expose*/){
		}
	});

