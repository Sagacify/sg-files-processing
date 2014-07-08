var commandFactory = require('../utils/docsplit-command');
var fileManager = require('../libs/node-lib/file/file_manager');
var contentType = require('../libs/node-lib/mimetypes/content_type').ext;
var is = require('../libs/node-lib/strict_typing/validateType');
var sanitize = require('../libs/node-lib/escaping/Sanitize');

var fs = require('fs-extra');
var path = require('path');
var async = require('async');
var FFmpeg = require('fluent-ffmpeg');

/*
    args 
        * filepath
        * filename (with extension)
        * mimetype (TODO : fallback identify here for separation of concern)
*/
exports.extractAll = function (args, callback) {
    // var self = this;

    // fs.exists(args.filepath, function (exists) {
    //     if (!exists) {
    //         return callback(new SGError(args.filepath + " doesn't exist !"));
    //     }

    //     console.log("mimetype : " + args.mimetype);
    //     var filename = args.filename;
    //     args.title = filename;
    //     console.log("title : " + args.title);
    //     args.filename = contentType.getName(filename);
    //     console.log("filename : " + args.filename);
    //     args.extension = contentType.getExt(filename);
    //     console.log("extension : " + args.extension);

    //     // rename file to prevent conflicts
    //     self.randomRenameFile(args.filepath, args.extension, function (err, filepath) {
    //         if (err) {
    //             return callback(err);
    //         }

    //         args.filepath = filepath;

    //         console.log("filepath: " + args.filepath);

    //         args.secure = true;
    //     });
    // });

    callback(null, {
        file: 'file info'
    });
};

exports.createVideo = function () {
    if (contentType.isVideo(args.mimetype)) {
        me.createSnapshot(args.filepath, function (err, snapshot) {
            if (err) {
                return callback(err);
            }

            me.sendThumbnailToSockets(args.author, args.socketId, snapshot);

            args.thumbnails = {
                large: snapshot
            };

            fileManager.uploadThenDeleteLocalFile(args.filepath, filename, args.extension, true, function (err, videoFilepath) {
                if (err) {
                    return callback(err);
                }

                args._id = videoFilepath;

                FileModel(args).save(function (err, file) {
                    callback(err, file ? file : null);
                });
            });
        });
    }
};

exports.createImage = function () {
    if (contentType.isImage(args.mimetype)) {
        fileManager.uploadThenDeleteLocalFile(args.filepath, filename, args.extension, args.secure, function (err, imgFilepath) {
            if (err) {
                return callback(err);
            }

            me.sendThumbnailToSockets(args.author, args.socketId, imgFilepath);

            args._id = imgFilepath;
            args.thumbnails = {
                large: imgFilepath
            };

            FileModel(args).save(function (err, file) {
                callback(err, file ? file : null);
            });
        });
    }
};

exports.createDocument = function () {
    async.parallel([

        function (callback) {
            if (args.mimetype == contentType.getContentType('pdf')) {
                return callback();
            }
            me.createPDFCommand(args.filepath, function (err, pdfFilepath) {
                if (err) {
                    console.log("Error pdf");
                    return callback(err);
                }
                args.pdf_file = pdfFilepath;
                callback();
            }).execute();
        },
        function (callback) {
            me.createPageshotCommand(args.filepath, function (err, imgFilepath) {
                if (err) {
                    // console.log("Error snapshot");
                    // return callback(err);
                    return callback();
                }

                me.sendThumbnailToSockets(args.author, args.socketId, imgFilepath);

                args.thumbnails = {
                    large: imgFilepath
                };
                callback();
            }).execute();
        },
        function (callback) {
            me.createPageLengthCommand(args.filepath, function (err, length) {
                if (err) {
                    console.log("Error page length");
                    return callback(err);
                }
                args.pages = length;
                console.log("pages : " + args.pages);
                callback();
            }).execute();
        },
        function (callback) {
            me.getTextFromFile(args.mimetype, args.filepath, function (err, data) {
                if (err) {
                    console.log("Error text");
                    return callback(err);
                }
                args.contentData = sanitize.clearText(data);
                callback();
            });
        },
        function (callback) {
            fileManager.getSize(args.filepath, function (err, size) {
                if (err) {
                    return callback(err);
                }

                args.size = size;
                callback();
            });
        }
    ], function (err, results) {
        if (err) {
            console.log("one or more comamnd fail");
            return callback(err);
        }
        console.log('------------------------------------');
        console.log('\n> DIR Scan - 9');
        console.log(fs.readdirSync(path.dirname(args.filepath)));
        console.log('------------------------------------');
        fileManager.uploadThenDeleteLocalFile(args.filepath, filename, args.extension, true, function (err, filepath) {
            console.log('------------------------------------');
            console.log('\n> DIR Scan - 10');
            console.log(fs.readdirSync(path.dirname(args.filepath)));
            console.log('------------------------------------');
            if (err) {
                console.log("After processing");
                console.log(err);
                return callback(err);
            }
            args._id = filepath;

            FileModel(args).save(callback);
        });
    });
};

FileSchema.statics.createFile = function (args, callback) {
    if (!args.base64data) {
        return callback(new SGError("no data for file"), null);
    }

    console.log("args.filename: ", args.filename);

    fileManager.writeFileToS3(args.base64data, args.filename, args.extension, args.secure, function (err, filename) {
        if (err) {
            return callback(err);
        }

        var FileModel = model("File");
        var file = FileModel({
            _id: config.AWS.s3StaticURL + "/" + config.AWS.s3BucketName + '/' + filename,
            filename: filename,
            extension: args.extension
            // author: args.author
        });

        if (args.author) {
            file.author = args.author;
        }

        file.save(callback);
    });
};

FileSchema.statics.removeFiles = function (files, callback) {
    var filenames = [];

    async.each(files, function (file, callback) {
        filenames.push(file._get('_id'));
        if (file.pdf_file) {
            filenames.push(file._get('pdf_file'));
        }
        if (file.thumbnails) {
            if (file.thumbnails.small) {
                filenames.push(file._get('thumbnails.small'));
            }
            if (file.thumbnails.medium) {
                filenames.push(file._get('thumbnails.medium'));
            }
            if (file.thumbnails.large) {
                filenames.push(file._get('thumbnails.large'));
            }
        }

        console.log("filenames: ", filenames);

        model('File').remove({
            _id: file._get('_id')
        }, callback);
    }, function (err) {
        if (err) {
            return callback(err);
        }
        fileManager.removeFilesFromS3(filenames, true, callback);
    });
};