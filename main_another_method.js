var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var engine = Random.engines.mt19937().autoSeed();
var S = require('string');
var HashMap = require("hashmap");


//  bian liang fang main func wai mian jiu bian cheng global de le!!!!!!!!!!!!!!!!
var functionConstraints = {}
var operatorArray = ['==', '!=', '>', '<'];

// key is different kinds of operstors (==, !=, >, <)
// value is all potential values that can cover different statements and branches.
var operatorHashMapWithFuncName = new HashMap();

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
			file1: 'text content',
		}
	}
};

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];


	var obeyArray = [];

	var currFuncIndex = 0;

	var formerCombinationNum = 0;

	var content = "var subject = require('./" + filePath + "')\nvar mock = require('mock-fs');\n";
	fs.writeFileSync('test.js', content, "utf8");

	constraints(filePath);
//console.log(operatorHashMapWithFuncName);

	// generate function constraints for each function
	operatorHashMapWithFuncName.forEach(function(value, key){
		// temporary!!!!!! value.get('params').length
		var paramsNum = value.count() - 2;
		numOfCombination = Math.pow(2, paramsNum);
		
//console.log(functionConstraints[key].params);
		for(var m = 0; m < numOfCombination; m++){
			var params = (value.get('params') == null) ? [] : value.get('params');
			functionConstraints[key] = {constraints:[], params: params};
			binaryNum = m.toString(2);
			// Pad 0 on the right side of the string
			var binaryString = S(binaryNum).padLeft(paramsNum, '0').replaceAll('', ',').s;
			var binaryArray = JSON.parse("[" + binaryString + "]");
		 console.log(binaryArray);
			for(var n = 0; n < paramsNum; n++){
				functionConstraints[key].constraints.push( 
					new Constraint(
					{
						ident: value.get('params')[n],
						value: value.get(value.get('params')[n])[binaryArray[n]],
						funcName: key,
						kind: "integer",  //tag
						operator : null,
						expression: value.get('expression')
					})
				);
			}
	console.log(functionConstraints[key].constraints);
			generateTestCases(filePath);
		}
	});
	
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	// Supported kinds: "fileWithContent","fileExists"
	// integer, string, phoneNumber
	this.kind = properties.kind;
}

function fakeDemo()
{
	// // console.log( faker.phone.phoneNumber() );
	// // console.log( faker.phone.phoneNumberFormat() );
	// // console.log( faker.phone.phoneFormats() );
}


function generateTestCases(filePath)
{
	var content = ''

	for ( var funcName in functionConstraints )
	{
		var params = {};

		// initialize params
		for (var i = 0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			//params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = '\'\'';
		}

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {kind: 'fileWithContent' });
		var pathExists      = _.some(constraints, {kind: 'fileExists' });

		// plug-in values for parameters
		for( var j = 0; j < constraints.length; j++ )
		{
			var constraint = constraints[j];
			// check whether params has key the same as constraint.ident
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident] = constraint.value;
			}
		}
// console.log(params);
		// Concatenate function arguments.
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
 console.log(args);
		// if( pathExists || fileWithContent )
		// {
		// 	content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args);
		// 	// Bonus...generate constraint variations test cases....
		// 	content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, args);
		// 	content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, args);
		// 	content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, args);
		// 	content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args);
		// }
		// else
		// {
			// Generate simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
// console.log("subject.{0}({1});\n".format(funcName, args ));
		// }

	}
	
	fs.appendFile('test.js', content, function (err) {
		if (err) return // // console.log(err);
		// // console.log('successfully appended "' + content + '"');
	});
}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
    var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);
	traverse(result, function (node) 
	{
		// '===', strict equal, returns true if the operands are equal and of the same type.
		// '==',  equal, 		returns true if the operands are equal, do not need to be the same type.
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			if(!operatorHashMapWithFuncName.has(funcName)){
				operatorHashMapWithFuncName.set(funcName, new HashMap());
			}

			// // console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});
			functionConstraints[funcName] = {constraints:[], params: params};
			// Check for expressions using argument.
			traverse(node, function(child)
			{
				//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
				if(child.type === 'BinaryExpression' && operatorArray.indexOf(child.operator) > -1)
				{
					if(child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						diffOperatorPotentialValues(child, params, buf, funcName);
					}
				}

				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					var expression = buf.substring(child.range[0], child.range[1]);

					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								// A fake path to a file
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileExists",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}
			});

			// // // console.log( functionConstraints[funcName]);

		}
	});
}

function diffOperatorPotentialValues(child, params, buf, funcName){
	var operator = child.operator;
	var childLeftName = child.left.name;
	// get expression from original source code:
	var expression = buf.substring(child.range[0], child.range[1]);
	var rightHand = buf.substring(child.right.range[0], child.right.range[1])

	var val = '';
	var revarseVal = '';
	switch(operator){
		case "==":
			val = rightHand;
			// add "!=" value
			revarseVal = JSON.stringify(Random.string()(engine, 11));
			addValToOperatorHashMap(childLeftName, val, revarseVal, funcName, expression, params);
			break;
		case "!=":
			val = "\"" + rightHand.replace(/["]+/g, '') + "Diff\"";
			// add "==" value
			revarseVal = rightHand;
			addValToOperatorHashMap(childLeftName, val, revarseVal, funcName, expression, params);
			break;
		case ">":
			val = (parseInt(rightHand) + 1) + "";
			// add "<=" value
			revarseVal = parseInt(rightHand) + "";
			addValToOperatorHashMap(childLeftName, val, revarseVal, funcName, expression, params);
			break;
		case "<":
			val = (parseInt(rightHand) - 1) + "";
			// add ">=" value
			revarseVal = parseInt(rightHand) + "";
			addValToOperatorHashMap(childLeftName, val, revarseVal, funcName, expression, params);
			break;
	}
// // console.log("operator\t" + operator);
// // console.log("obey\t" + obey);
// // console.log("val\t" + val);
// // console.log("++++++++++++++++++++++++++");
	
}

function addValToOperatorHashMap(childLeftName, val, reverseVal, funcName, expression, params){
	var temp_arr = [];
	if(operatorHashMapWithFuncName.get(funcName).has(childLeftName)){
		temp_arr = operatorHashMapWithFuncName.get(funcName).get(childLeftName);
	}
	if(temp_arr.indexOf(val) == -1){
		temp_arr.push(val);
	}
	if(temp_arr.indexOf(reverseVal) == -1){
		temp_arr.push(reverseVal);
	}
	operatorHashMapWithFuncName.get(funcName).set(childLeftName, temp_arr);
	// add expression info into hash
	if(!operatorHashMapWithFuncName.get(funcName).has('expression')){
		operatorHashMapWithFuncName.get(funcName).set('expression', expression);
	}
	// add params info into hash
	if(!operatorHashMapWithFuncName.get(funcName).has('params')){
		operatorHashMapWithFuncName.get(funcName).set('params', params);
	}
	console.log(operatorHashMapWithFuncName.get(funcName).get('params'));
}


function traverse(object, visitor) 
{
	var key, child;

	visitor.call(null, object);
	for (key in object) {
		if (object.hasOwnProperty(key)) {
			child = object[key];
			if (typeof child === 'object' && child !== null) {
				traverse(child, visitor);
			}
		}
	}
}

function traverseWithCancel(object, visitor)
{
	var key, child;

	if( visitor.call(null, object) )
	{
		for (key in object) {
			if (object.hasOwnProperty(key)) {
				child = object[key];
				if (typeof child === 'object' && child !== null) {
					traverseWithCancel(child, visitor);
				}
			}
		}
	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
	var args = arguments;
	return this.replace(/{(\d+)}/g, function(match, number) { 
	  return typeof args[number] != 'undefined'
		? args[number]
		: match
	  ;
	});
  };
}

main();
