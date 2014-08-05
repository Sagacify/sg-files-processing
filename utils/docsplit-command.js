// --output or -o can be passed to any command in order to store the generated files in a directory of your choosing. 
var nodeShell = require('node-lib').child_process;
var async = require("async");
var os = require('os');

var baseCommand = (os.type() == 'Linux' ? 'sudo /usr/local/bin/docsplit' : 'docsplit');

var count = 0;

var q = async.queue(function (shellCommand, callback) {
	count++;
	console.log("Spawning job : " + count);

	nodeShell.execute(shellCommand, function (args) {
		count--;
		callback.apply(this, arguments);
	});
}, 1);

function Command(type, sourceFile, argsArray, argsDict, callback)  {
	this.type = type;
	this.sourceFile = sourceFile;
	this.argsArray = argsArray;
	this.argsDict = argsDict;
	this.callback = callback;
}

Command.prototype.execute = function (callback) {
	console.log("launch docsplit command :");

	var shellCommand = [baseCommand].concat(this.type).concat(this.sourceFile).join(' ');

	if (this.argsArray && this.argsArray.length) {
		this.argsArray.forEach(function (arg) {
			shellCommand = shellCommand.concat(" --" + arg);
		});
	}

	if (this.argsDict && Object.keys(this.argsDict).length) {
		for (var key in this.argsDict) {
			shellCommand = shellCommand.concat(" --" + key).concat(" ").concat(this.argsDict[key]);
		}
	}

	console.log(shellCommand);

	q.push(shellCommand, callback || this.callback);
	
	// nodeShell.execute(shellCommand, callback || this.callback);
	// nodeShell.execute(shellCommand, callback);
};

exports.eachExecute = function (commands, callback) {
	var realCommands = [];

	commands.forEach(function (command) {
		if (command !== null) {
			realCommands.push(command);
		}
	});

	var length = realCommands.length;

	realCommands.forEach(function (command) {
		command.execute(function (error, stderr, stdout) {
			command.callback(error, stderr, stdout);
			length--;
			if (length === 0) {
				callback();
			}
		});
	});
};

//--size --format --pages --density

exports.ImageCommand = function (sourceFile, argsArray, argsDict, callback) {
	return new Command('images', sourceFile, argsArray, argsDict, callback);
};

exports.PDFCommand = function (sourceFile, argsArray, argsDict, callback) {
	return new Command('pdf', sourceFile, argsArray, argsDict, callback);
};

//--pages --ocr --no-ocr --no-clean

exports.TextCommand = function (sourceFile, argsArray, argsDict, callback) {
	return new Command('text', sourceFile, argsArray, argsDict, callback);
};

//author, date, creator, keywords, producer, subject, title, length

exports.LengthCommand = function (sourceFile, argsArray, argsDict, callback) {
	return new Command('length', sourceFile, argsArray, argsDict, callback);
};