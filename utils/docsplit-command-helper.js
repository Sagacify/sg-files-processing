FileSchema.statics.createSnapshot = function (filepath, callback) {
    var FFmpegmeta = FFmpeg.Metadata;

    new FFmpegmeta(filepath, function (metadata, err) {
        if (err) {
            return callback(err);
        }

        console.log(require('util').inspect(metadata, false, null));

        var width = metadata.video.resolution.w;
        var height = metadata.video.resolution.h;

        new FFmpeg({
            source: filepath
        }).withSize(width + 'x' + height).on('error', function (err) {
            console.log('An error occurred: ' + err.message);
            //return callback(err);
            callback();
        }).on('end', function (filenames) {
            console.log('Successfully generated ' + filenames.join(', ') + " in " + path.dirname(filepath));

            fileManager.uploadThenDeleteLocalFile(path.join(path.dirname(filepath), filenames[0]), filenames[0], 'jpg', true, callback);
        }).takeScreenshots({
            count: 1,
            timemarks: ['1']
        }, path.dirname(filepath));
    });
};

FileSchema.statics.createPDFCommand = function (filepath, callback) {
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
        fileManager.uploadThenDeleteLocalFile(newFilepath, filename, 'pdf', true, callback);
    });
};

FileSchema.statics.createPageshotCommand = function (filepath, callback) {
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
        fileManager.uploadThenDeleteLocalFile(newFilepath, filename, 'jpg', true, callback);
    });
};

FileSchema.statics.createPageLengthCommand = function (filepath, callback) {
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

FileSchema.statics.createTextCommand = function (filepath, callback) {
    return commandFactory.TextCommand(filepath, ['no-ocr'], {
        "output": path.dirname(filepath)
    }, function (error, stderr, stdout) {
        if (error || stderr) {
            // Instead of returning callback with error, we assume there is no text content Tesseract can OCR. It may fail on unsupported image for example.
            return callback();
        }
        var filename = path.basename(filepath, path.extname(filepath)) + '.txt';
        var newFilepath = path.join(path.dirname(filepath), filename);
        fileManager.readThenDeleteLocalFile(newFilepath, function (err, data) {
            callback(err, data ? data.toString() : null);
        });
    });
};

FileSchema.statics.getTextFromFile = function (mimetype, filepath, callback) {
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