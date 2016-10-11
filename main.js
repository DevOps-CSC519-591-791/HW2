var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var S = require('string');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	var operatorArray = ['==', '!=', '>', '<'];

	var obeyArray = [];
	// var obeyArray = [[0, 0, 1, 0, 1, 0, 1, 0],
	// 				 [0, 1, 1, 0, 1, 0, 1, 0],
	// 				 [1, 0, 1, 0, 1, 0, 1, 0],
	// 				 [1, 1, 1, 0, 1, 0, 1, 0]];
	for(var m = 0; m < Math.pow(2, 8); m++){
		binaryNum = m.toString(2);
		// Pad 0 on the right side of the string
		var binaryString = S(binaryNum).padLeft(8, '0').replaceAll('', ',').s;
		var binaryArray = JSON.parse("[" + binaryString + "]");
		obeyArray.push(binaryArray);
	}
	console.log(obeyArray);
	var operatorObeyArrayIndex = 0;

	for(var k = 0; k < obeyArray.length; k++){
		var operatorObeyArray = obeyArray[k];
console.log("=============================================");
console.log("k\t" + k);
		if(k == 0){
			constraints(filePath, operatorArray, operatorObeyArray, operatorObeyArrayIndex);
			// Record whether it is the first time to write 'test.js' file.
			var isFirstTime = true
			generateTestCases(filePath, isFirstTime);
		}
		else{
			functionConstraints = {}
			constraints(filePath, operatorArray, operatorObeyArray, operatorObeyArrayIndex);
			var isFirstTime = false
			generateTestCases(filePath, isFirstTime);
			operatorObeyArrayIndex = 0;
		}
	}
}

var engine = Random.engines.mt19937().autoSeed();

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
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints = {}

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

function generateTestCases(filePath, isFirstTime)
{
	if(isFirstTime){
		var content = "var subject = require('./" + filePath + "')\nvar mock = require('mock-fs');\n";
	}
	else{
		var content = "";
	}

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

		// Concatenate function arguments.
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
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
		// }

	}
	// if it is first time, fs will create a new file and write the content.
	if(isFirstTime){
		fs.writeFileSync('test.js', content, "utf8");
	}
	// if it is not the first time, fs will append the content to test.js.
	else{
		fs.appendFile('test.js', content, function (err) {
			if (err) return console.log(err);
			console.log('successfully appended "' + content + '"');
		});
	}
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

function constraints(filePath, operatorArray, operatorObeyArray, operatorObeyArrayIndex)
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
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

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
						// console.log(child.operator);
						
				console.log("operatorObeyArrayIndex\t" + operatorObeyArrayIndex);
				console.log("Obey\t" + operatorObeyArray[operatorObeyArrayIndex]);
						constraintWithDiffOperator(child, params, buf, funcName, operatorObeyArray[operatorObeyArrayIndex]);
						operatorObeyArrayIndex++;
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

			// console.log( functionConstraints[funcName]);

		}
	});
}

function constraintWithDiffOperator(child, params, buf, funcName, obey){
	var operator = child.operator;

	// get expression from original source code:
	var expression = buf.substring(child.range[0], child.range[1]);
	var rightHand = buf.substring(child.right.range[0], child.right.range[1])

	if((operator == "==" && obey == 1) || (operator == "!=" && obey == 0)){
		var val = rightHand;
	}
	else if((operator == "==" && obey == 0) || (operator == "!=" && obey == 1)){
		// JSON.stringify() converts plain output to string
		var val = JSON.stringify(Random.string()(engine, 11));
	}
	if((operator == "<" && obey == 1) || (operator == ">" && obey == 0)){
		var val = (parseInt(rightHand) - 1) + "";
	}
	else if((operator == "<" && obey == 0) || (operator == ">" && obey == 1)){
		var val = (parseInt(rightHand) + 1) + "";
	}
	// if(operator == ">" && obey == 1){
	// 	var val = (parseInt(rightHand) + 1) + "";
	// }
	// else if(operator == ">" && obey == 0){
	// 	var val = parseInt(rightHand) + "";
	// }
	// if(operator == "!=" && obey == 1){
	// 	var val = "\"" + rightHand.replace(/["]+/g, '') + "Diff\"";
	// }
	// else if(operator == "!=" && obey == 0){
	// 	var val = rightHand;
	// }
// debugger;
console.log("operator\t" + operator);
console.log("obey\t" + obey);
console.log("val\t" + val);
console.log("++++++++++++++++++++++++++");
	functionConstraints[funcName].constraints.push( 
		new Constraint(
		{
			ident: child.left.name,
			value: val,
			funcName: funcName,
			kind: "integer",  //tag
			operator : child.operator,
			expression: expression
		}));
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
