function Node(properties){
	this.data = properties.data;
	this.left = (properties.left == undefined) ? null : properties.left;
	this.right = (properties.right == undefined) ? null : properties.right;
} 

function buildBinaryTree(rootNode, level){

	if(level == 1){
		rootNode.left = 0;
		rootNode.right = 1;
		return rootNode;
	}
	else{
debugger;
		rootNode.left = new Node({
									data: 0,
									left: buildBinaryTree(new Node({data: 0}), level),
									right: buildBinaryTree(new Node({data: 1}), level)
								});
		rootNode.right = new Node({
									data: 1,
									left: buildBinaryTree(new Node({data: 0}), level),
									right: buildBinaryTree(new Node({data: 1}), level)
								});
		level--;
		console.log(level);
	}
}

var level = 2;
var rootNode = new Node({data: null});
buildBinaryTree(rootNode, level);