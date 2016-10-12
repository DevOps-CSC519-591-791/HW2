var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var S = require('string');
var HashMap = require("hashmap");

var equalStringArr = [];

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	var operatorArray = ['==', '!=', '>', '<', '||'];
	var reverseOperatorHashMap = new HashMap();
	
	var obeyArray = [];
	var currFuncIndex = 0;
	var hashMap = new HashMap();
	checkInAdvanceForEachFunction(filePath, obeyArray, operatorArray, hashMap);
	var formerCombinationNum = 0;
	var content = "var subject = require('./" + filePath + "')\nvar mock = require('mock-fs');\n";
	fs.writeFileSync('test.js', content, "utf8");

	hashMap.forEach(function(value, key){
		for(var k = 0; k < value; k++){
			var operatorObeyArray = obeyArray[k + formerCombinationNum];
			var currFuncName = key;
			functionConstraints = {}
			constraints(filePath, operatorArray, currFuncName, operatorObeyArray, 0);
			generateTestCases(filePath);
		}
		formerCombinationNum += value;
	});
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
	// console.log( faker.phone.phoneNumber() );
	// console.log( faker.phone.phoneNumberFormat() );
	// console.log( faker.phone.phoneFormats() );
}

var functionConstraints = {}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	pathWithEmptyFile:
	{
		'path/fileExists': {file1: ''}
	},
	pathWithFile:
	{
		'path/fileExists': {file1: 'something'}
	},
	fileWithContent:
	{
		pathContent: 
		{	
			file1: 'text content',
		}
	},
	fileWithoutContent:
	{
		pathContent:
		{
			file1: '',
		}
	},
	fileNotExist:
	{
		pathContent: {}
	}
};

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
		var pathWithFile = _.some(constraints, {kind: 'pathWithFile'});
		var fileNotExist = _.some(constraints, {kind: 'fileNotExist'});
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

		if( pathExists || fileWithContent )
		{
			content += generateMockFsTestCases(pathExists, pathWithFile, fileNotExist, fileWithContent,funcName, args);
			content += generateMockFsTestCases(!pathExists, pathWithFile, fileNotExist, fileWithContent,funcName, args);
			content += generateMockFsTestCases(!pathExists, pathWithFile, !fileNotExist, fileWithContent,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(pathExists,!pathWithFile,fileNotExist, fileWithContent,funcName, args);
			content += generateMockFsTestCases(pathExists,pathWithFile,!fileNotExist, fileWithContent,funcName, args);
			content += generateMockFsTestCases(pathExists,pathWithFile,fileNotExist, !fileWithContent,funcName, args);
			content += generateMockFsTestCases(!pathExists,!pathWithFile,fileNotExist, !fileWithContent,funcName, args);
		}
		else
		{
			// Generate simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}

	}
	
	fs.appendFile('test.js', content, function (err) {
		if (err) return // // console.log(err);
		// // console.log('successfully appended "' + content + '"');
	});
}

function generateMockFsTestCases (pathExists,pathWithFile,fileNotExist, fileWithContent,funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( !pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	else if(pathWithFile)
	{
		for (var attrname in mockFileLibrary.pathWithFile) { mergedFS[attrname] = mockFileLibrary.pathWithFile[attrname]; }
	}
	else{
		for (var attrname in mockFileLibrary.pathWithEmptyFile) { mergedFS[attrname] = mockFileLibrary.pathWithEmptyFile[attrname]; }
	}
	if(fileNotExist)
	{
		for (var attrname in mockFileLibrary.fileNotExist) { mergedFS[attrname] = mockFileLibrary.fileNotExist[attrname]; }
	}
	else if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}
	else
	{
		for (var attrname in mockFileLibrary.fileWithoutContent) { mergedFS[attrname] = mockFileLibrary.fileWithoutContent[attrname]; }
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

function checkInAdvanceForEachFunction(filePath, obeyArray, operatorArray, hashMap){
	var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);
	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			// store funcName in array
			var funcName = functionName(node);
			var targetOperatorNum = 0;
			var params = node.params.map(function(p) {return p.name});
			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if(child.type === 'BinaryExpression' && operatorArray.indexOf(child.operator) > -1)
				{
					//count target operator number in each function
					targetOperatorNum++;
				}
			});

			numOfCombination = Math.pow(2, targetOperatorNum);
			// insert funName and # of combination according to the # of target operators
			// into hashMap
			hashMap.set(funcName, numOfCombination);

			for(var m = 0; m < numOfCombination; m++){
				binaryNum = m.toString(2);
				// Pad 0 on the right side of the string
				var binaryString = S(binaryNum).padLeft(targetOperatorNum, '0').replaceAll('', ',').s;
				var binaryArray = JSON.parse("[" + binaryString + "]");
				obeyArray.push(binaryArray);
			}
		}
	});
}

function constraints(filePath, operatorArray, currFuncName, operatorObeyArray, operatorObeyArrayIndex)
{
    var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);
	var diffString = '';
	traverse(result, function (node) 
	{
		// '===', strict equal, returns true if the operands are equal and of the same type.
		// '==',  equal, 		returns true if the operands are equal, do not need to be the same type.
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			if(funcName != currFuncName){
				return;
			}
			
			// // console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});
			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="indexOf" )
				{
					var expression = buf.substring(child.range[0], child.range[1]);

					for( var p =0; p < params.length; p++ )
					{
						if( child.callee.object.name == params[p] )
						{
							diffString = child.arguments[0].value;
					//console.log(diffString);
							functionConstraints[funcName].constraints.push( 
								new Constraint(
								{
									ident: params[p],
									value:  child.arguments[0].value,
									funcName: currFuncName,
									kind: "integer",
									operator : "==",
									expression: expression
								}));
						}
					}
				}

				if(child.type === 'BinaryExpression' && operatorArray.indexOf(child.operator) > -1)
				{
					if(child.left.type == 'Identifier' && 
						(params.indexOf( child.left.name ) > -1 || child.left.name == "area"))
					{
						constraintWithDiffOperator(child, params, buf, funcName, operatorObeyArray[operatorObeyArrayIndex], diffString);
						operatorObeyArrayIndex++;
					}
				}

				if(child.type === 'LogicalExpression' && operatorArray.indexOf(child.operator) > -1)
				{
					if(child.right.type == 'UnaryExpression' &&
					 	child.right.argument.type == 'MemberExpression')
					{
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.right.argument.object.name,
								value: "{normalize: true}",
								funcName: funcName,
								kind: "integer",  //tag
								operator : child.operator,
								expression: expression
							}));
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

function constraintWithDiffOperator(child, params, buf, funcName, obey, diffString){
	var operator = child.operator;

	// get expression from original source code:
	var expression = buf.substring(child.range[0], child.range[1]);
	var rightHand = buf.substring(child.right.range[0], child.right.range[1])

	if((operator == "==" && obey == 1) || (operator == "!=" && obey == 0)){
		equalStringArr.push(rightHand);
		if(child.left.name == "area"){
			var val = JSON.stringify(faker.phone.phoneNumberFormat()).substr(-10);
			val = rightHand.slice(0, -1) + val;
		}
		else{
			var val = equalStringArr[Random.integer(0, equalStringArr.length)(engine)];
			if(val == null){
				val = rightHand;
			}
		}
	}
	else if((operator == "==" && obey == 0) || (operator == "!=" && obey == 1)){
		if(child.left.name == "area"){
			var val = JSON.stringify(faker.phone.phoneNumberFormat());
		}
		else{
			// JSON.stringify() converts plain output to string
			var potentialValueArr = [];
			potentialValueArr.push(JSON.stringify(Random.string()(engine, 11)));
			potentialValueArr.push(JSON.stringify(diffString));

			var val = potentialValueArr[Random.integer(0, 1)(engine)];
		}
	}
	if((operator == "<" && obey == 1) || (operator == ">" && obey == 0)){
		var val = (parseInt(rightHand) - 1) + "";
	}
	else if((operator == "<" && obey == 0) || (operator == ">" && obey == 1)){
		var val = (parseInt(rightHand) + 1) + "";
	}

	if(child.left.name == "area"){
		functionConstraints[funcName].constraints.push( 
			new Constraint(
			{
				ident: "phoneNumber",
				value: val,
				funcName: funcName,
				kind: "integer",  //tag
				operator : child.operator,
				expression: expression
			}));
	}
	else{
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