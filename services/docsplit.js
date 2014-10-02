// Node.js core module
var path = require('path');

// NPM modules
var fs = require('fs-extra');
var async = require('async');

// SSH modules
var contentType = require('node-lib').content_type.ext;
var sanitize = require('node-lib').sanitize;

var sgFilesSystem = require('sg-files-system');
var FSService = sgFilesSystem.FSService;
var S3Service = sgFilesSystem.S3Service;

var SgMessagingServer = require('sg-messaging-server');
var sgMessagingServer;

// Local modules
var commandFactory = require('../utils/docsplit-command');
var docsplitHelper = require('../helpers/docsplit-helper');

var s3Service;

exports.extractFromLink = function (link, s3Config, redisConfig, linkCallback, callback) {
    var s3Service = new S3Service(s3Config);
    sgMessagingServer = new SgMessagingServer(redisConfig);
    var file = {
        secure: true
    };

    FSService.getFileFromUrl(link.url, function (err, filepath, filename) {
        if (err) {
            return linkCallback(err);
        }

        file.filepath = filepath;
        file.filename = filename;

        s3Service.uploadFileOnS3(file.filepath, file.filename, contentType.getExt(file.filename), file.secure, function (err, _id) {
            if (err) {
                return linkCallback(err);
            }

            file._id = _id;

            sgMessagingServer().publish('link:' + link._id + ':file', {
                link: link,
                file: file
            });

            exports.launch(file, s3Service, redisConfig, function (err) {
                fs.unlink(file.filepath);
                delete file.filepath;

                callback(err, file);
            });
        });
    });
};

exports.extractFromLocal = function (file, s3Config, redisConfig, callback) {
    var s3Service = new S3Service(s3Config);
    sgMessagingServer = new SgMessagingServer(redisConfig);

    file.secure = true;

    s3Service.uploadFileOnS3(file.filepath, file.filename, contentType.getExt(file.filename), true, function (err, _id) {
        if (err) {
            return callback(err);
        }

        file._id = _id;

        exports.launch(file, s3Service, redisConfig, function (err) {
            fs.unlink(file.filepath);
            delete file.filepath;

            callback(err, file);
        });
    });
};

exports.extractAll = function (file, key, s3Config, redisConfig, callback) {
    var s3Service = new S3Service(s3Config);
    sgMessagingServer = new SgMessagingServer(redisConfig);

    s3Service.getFileFromS3AndWriteItToFileSystem(key, file.secure, function (err, filepath) {
        if (err) {
            return callback(err);
        }

        file.filepath = filepath;

        exports.launch(file, s3Service, redisConfig, function (err) {
            fs.unlink(file.filepath);
            delete file.filepath;

            callback(err, file);
        });
    });
};

exports.launch = function (file, s3ServiceOrConfig, redisConfig, callback) {
    var s3Service = s3ServiceOrConfig;
    if (!sgMessagingServer) {
        sgMessagingServer = new SgMessagingServer(redisConfig);
    }

    if (!s3ServiceOrConfig instanceof S3Service) {
        s3Service = new S3Service(s3ServiceOrConfig);
    }

    var filename = file.filename;
    file.title = filename;
    file.filename = contentType.getName(filename);
    file.extension = contentType.getExt(filename);
    file.mimetype = contentType.getContentType(file.extension);

    fs.exists(file.filepath, function (exists) {
        if (!exists) {
            return callback(new Error(file.filepath + " doesn't exist !"));
        }

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
        case 'UNKNOWN':
            exports.createUnknown(file, s3Service, callback);
            break;
        }
    });
};

exports.createUnknown = function (file, s3Service, callback) {
    docsplitHelper.setSize(file, callback);
};

exports.createArchive = function (file, s3Service, callback) {
    if (!contentType.isArchive(file.mimetype)) {
        return callback(new Error('NOT_ARCHIVE'));
    }

    docsplitHelper.setSize(file, callback);
};

exports.createVideo = function (file, s3Service, callback) {
    if (!contentType.isVideo(file.mimetype)) {
        return callback(new Error('NOT_VIDEO'));
    }

    async.parallel([

        function getSnapshot(callback) {
            docsplitHelper.createSnapshot(file.filepath, s3Service, function (err, snapshot) {
                if (err) {
                    return callback(err);
                }

                file.thumbnails = {
                    large: snapshot
                };

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                });

                callback();
            });
        },
        function getSize(callback) {
            docsplitHelper.setSize(file, function (err, file) {
                if (err) {
                    return callback(err);
                }

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                });

                callback();
            });
        }
    ], function (err) {
        if (err) {
            console.log("one or more command fail");
            return callback(err);
        }

        callback(null, file);
    });
};

exports.createImage = function (file, callback) {
    if (!contentType.isImage(file.mimetype)) {
        return callback(new Error('NOT_IMAGE'));
    }

    file.thumbnails = {
        large: file._id
    };

    sgMessagingServer().publish('file:' + file._id, {
        file: file
    });

    docsplitHelper.setSize(file, callback);
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
            docsplitHelper.setSize(file, function (err, file) {
                if (err) {
                    return callback(err);
                }

                sgMessagingServer().publish('file:' + file._id, {
                    file: file
                });

                callback();
            });
        }
    ], function (err, results) {
        if (err) {
            console.log("one or more command fail");
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