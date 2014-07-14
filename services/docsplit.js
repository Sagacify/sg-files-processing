var commandFactory = require('../utils/docsplit-command');
var docsplitHelper = require('../helpers/docsplit-helper');

var contentType = require('node-lib').content_type.ext;
var sanitize = require('node-lib').sanitize;

var sgFilesSystem = require('sg-files-system');
var FSService = sgFilesSystem.FSService;
var S3Service = sgFilesSystem.S3Service;

var SgMessagingServer = require('sg-messaging-server');
var sgMessagingServer = new SgMessagingServer();

var fs = require('fs-extra');
var path = require('path');
var async = require('async');

exports.extractAll = function (file, fileConfig, s3Config, callback) {
    var self = this;
    var s3Service = new S3Service(s3Config);
    file.secure = true;

    // TODO change fileConfig.bucket with file.secure
    s3Service.getFileFromS3AndWriteItToFileSystem(fileConfig.key, fileConfig.bucket, function (err, filepath) {
        if (err) {
            return callback(err);
        }

        file.filepath = filepath;

        fs.exists(file.filepath, function (exists) {
            if (!exists) {
                return callback(new SGError(file.filepath + " doesn't exist !"));
            }

            var filename = fileConfig.name;
            file.title = filename;
            console.log("title : " + file.title);
            file.filename = contentType.getName(filename);
            console.log("filename : " + file.filename);
            file.extension = contentType.getExt(filename);
            console.log("extension : " + file.extension);
            file.mimetype = contentType.getContentType(file.extension);
            console.log("mimetype : " + file.mimetype);

            switch (contentType.getMediaType(file.mimetype)) {
            case 'IMAGE':
                exports.createImage(file, callback);
                break;
            case 'VIDEO':
                exports.createVideo(file, s3Service, callback);
                break;
            case 'ARCHIVE':
                exports.createArchive(file, s3Service, callback);
                break;
            case 'DOCUMENT':
                exports.createDocument(file, s3Service, callback);
                break;
            }
        });
    });
};

exports.createArchive = function (file, s3Service, callback) {
    if (!contentType.isArchive(file.mimetype)) {
        return callback(new SGError('NOT_ARCHIVE'));
    }

    callback(null, file);
};

exports.createVideo = function (file, s3Service, callback) {
    if (!contentType.isVideo(file.mimetype)) {
        return callback(new SGError('NOT_VIDEO'));
    }

    docsplitHelper.createSnapshot(file.filepath, s3Service, function (err, snapshot) {
        if (err) {
            return callback(err);
        }

        file.thumbnails = {
            large: snapshot
        };

        sgMessagingServer().publish('file:' + file._id, {
            file: file
        }, function (err, response) {
            console.log(response);
        });

        fs.unlink(file.filepath, function (err) {
            if (err) {
                return callback(err);
            }

            callback(null, file);
        });
    });
};

exports.createImage = function (file, callback) {
    if (!contentType.isImage(file.mimetype)) {
        return callback(new SGError('NOT_IMAGE'));
    }

    file.thumbnails = {
        large: file._id
    };

    callback(null, file);
};

exports.createDocument = function (file, s3Service, callback) {
    var self = this;
    async.parallel([

        function getPDF(callback) {
            if (file.mimetype == contentType.getContentType('pdf')) {
                return callback();
            }
            docsplitHelper.createPDFCommand(file.filepath, s3Service, function (err, pdfFilepath) {
                if (err) {
                    console.log("Error pdf");
                    return callback(err);
                }
                file.pdf_file = pdfFilepath;

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                }, function (err, response) {
                    console.log(response);
                });

                callback();
            }).execute();
        },
        function getPageshot(callback) {
            docsplitHelper.createPageshotCommand(file.filepath, s3Service, function (err, imgFilepath) {
                if (err) {
                    // console.log("Error snapshot");
                    // return callback(err);
                    return callback();
                }

                file.thumbnails = {
                    large: imgFilepath
                };

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                }, function (err, response) {
                    console.log(response);
                });

                callback();
            }).execute();
        },
        function getLength(callback) {
            docsplitHelper.createPageLengthCommand(file.filepath, function (err, length) {
                if (err) {
                    console.log("Error page length");
                    return callback(err);
                }
                file.pages = length;
                console.log("pages : " + file.pages);

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                }, function (err, response) {
                    console.log(response);
                });

                callback();
            }).execute();
        },
        function getText(callback) {
            docsplitHelper.getTextFromFile(file.mimetype, file.filepath, function (err, data) {
                if (err) {
                    console.log("Error text");
                    return callback(err);
                }
                file.contentData = sanitize.clearText(data);
                callback();
            });
        },
        function getSize(callback) {
            FSService.getSize(file.filepath, function (err, size) {
                if (err) {
                    return callback(err);
                }

                file.size = size;

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                }, function (err, response) {
                    console.log(response);
                });

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
        console.log(fs.readdirSync(path.dirname(file.filepath)));
        console.log('------------------------------------');

        callback(null, file);
    });
};

// TODO refactor
exports.removeFiles = function (files, callback) {
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