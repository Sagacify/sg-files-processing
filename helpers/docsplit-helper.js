// Node.js core module
var path = require('path');
var util = require('util');

// NPM modules
var fs = require('fs-extra');
var FFmpeg = require('fluent-ffmpeg');

// SSH modules
var contentType = require('node-lib').content_type.ext;
var is = require('node-lib').validateType;
var FSService = require('sg-files-system').FSService;

// Local modules
var commandFactory = require('../utils/docsplit-command');

exports.createSnapshot = function (filepath, s3Service, callback) {
    var FFmpegmeta = FFmpeg.Metadata;

    new FFmpegmeta(filepath, function (metadata, err) {
        if (err) {
            return callback(err);
        }

        console.log(util.inspect(metadata, false, null));

        var width = metadata.video.resolution.w;
        var height = metadata.video.resolution.h;

        new FFmpeg({
            source: filepath
        }).withSize(width + 'x' + height).on('error', function (err) {
            console.log('An error occurred: ' + err.message);
            return callback(err);
        }).on('end', function (filenames) {
            console.log('Successfully generated ' + filenames.join(', ') + " in " + path.dirname(filepath));

            s3Service.uploadThenDeleteLocalFile(path.join(path.dirname(filepath), filenames[0]), filenames[0], 'jpg', true, callback);
        }).takeScreenshots({
            count: 1,
            timemarks: ['1']
        }, path.dirname(filepath));
    });
};

exports.createPDFCommand = function (filepath, s3Service, callback) {
    console.log('------------------------------------');
    console.log('\n> DIR Scan - 1');
    console.log(fs.readdirSync(path.dirname(filepath)));
    console.log('------------------------------------');

    return new commandFactory.PDFCommand(filepath, [], {
        "output": path.dirname(filepath)
    }, function (error, stderr, stdout) {
        console.log('------------------------------------');
        console.log('\n> DIR Scan - 2');
        console.log(fs.readdirSync(path.dirname(filepath)));
        console.log('------------------------------------');
        if (error || stderr) {
            return callback((error || stderr) + "\n" + stdout);
        }
        var filename = path.basename(filepath, path.extname(filepath)) + '.pdf';
        var newFilepath = path.join(path.dirname(filepath), filename);
        s3Service.uploadThenDeleteLocalFile(newFilepath, filename, 'pdf', true, callback);
    });
};

exports.createPageshotCommand = function (filepath, s3Service, callback) {
    console.log('------------------------------------');
    console.log('\n> DIR Scan - 3');
    console.log(fs.readdirSync(path.dirname(filepath)));
    console.log('------------------------------------');

    return commandFactory.ImageCommand(filepath, [], {
        "output": path.dirname(filepath),
        'format': 'jpg',
        'pages': '1'
    }, function (error, stderr, stdout) {
        console.log('------------------------------------');
        console.log('\n> DIR Scan - 4');
        console.log(fs.readdirSync(path.dirname(filepath)));
        console.log('------------------------------------');

        if (error || stderr) {
            return callback((error || stderr) + "\n" + stdout);
        }

        var filename = path.basename(filepath, path.extname(filepath)) + '_1.jpg';
        var newFilepath = path.join(path.dirname(filepath), filename);
        s3Service.uploadThenDeleteLocalFile(newFilepath, filename, 'jpg', true, callback);
    });
};

exports.createPageLengthCommand = function (filepath, callback) {
    console.log('------------------------------------');
    console.log('\n> DIR Scan - 5');
    console.log(fs.readdirSync(path.dirname(filepath)));
    console.log('------------------------------------');

    return commandFactory.LengthCommand(filepath, [], {}, function (error, stderr, stdout) {
        console.log('------------------------------------');
        console.log('\n> DIR Scan - 6');
        console.log(fs.readdirSync(path.dirname(filepath)));
        console.log('------------------------------------');

        if (error || stderr) {
            return callback((error || stderr) + "\n" + stdout);
        }
        // var trim = stdout.replace(/\r?\n|\r/g, '');
        // console.log("pages number = \"" + trim + "\"");
        var number = parseInt(stdout, 10);
        var pages = is.Number(number) ? number : -1;
        callback(null, pages);
    });
};

exports.createTextCommand = function (filepath, callback) {
    return commandFactory.TextCommand(filepath, ['no-ocr'], {
        "output": path.dirname(filepath)
    }, function (error, stderr, stdout) {
        if (error || stderr) {
            // Instead of returning callback with error, we assume there is no text content Tesseract can OCR. It may fail on unsupported image for example.
            return callback();
        }
        var filename = path.basename(filepath, path.extname(filepath)) + '.txt';
        var newFilepath = path.join(path.dirname(filepath), filename);
        FSService.readThenDeleteLocalFile(newFilepath, function (err, data) {
            callback(err, data ? data.toString() : null);
        });
    });
};

exports.getTextFromFile = function (mimetype, filepath, callback) {
    console.log('------------------------------------');
    console.log('\n> DIR Scan - 7');
    console.log(fs.readdirSync(path.dirname(filepath)));
    console.log('------------------------------------');

    if (mimetype != contentType.getContentType('txt')) {
        this.createTextCommand(filepath, callback).execute();
    } else {
        fs.readFile(filepath, function (err, data) {
            console.log('------------------------------------');
            console.log('\n> DIR Scan - 8');
            console.log(fs.readdirSync(path.dirname(filepath)));
            console.log('------------------------------------');

            callback(err, data ? data.toString() : null);
        });
    }
};

exports.setSize = function (file, callback) {
    FSService.getSize(file.filepath, function (err, size) {
        if (err) {
            return callback(err);
        }

        file.size = size;

        callback(null, file);
    });
};