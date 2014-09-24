define(function(require, exports, module) {
    main.consumes = [
        "MountTab", "ui", "proc", "c9", "fs", "mount"
    ];
    main.provides = ["mount.sftp"];
    return main;

    function main(options, imports, register) {
        var MountTab = imports.MountTab;
        var ui = imports.ui;
        var proc = imports.proc;
        var c9 = imports.c9;
        var fs = imports.fs;
        var mnt = imports.mount;
        
        var SFTPFS = options.sshfsBin || "sshfs";
        var FUSERMOUNT = options.fusermountBin || "fusermount";
        
        /***** Initialization *****/
        
        var plugin = new MountTab("Ajax.org", main.consumes, { 
            caption: "SFTP", 
            name: "sftp", 
            index: 200 
        });
        // var emit = plugin.getEmitter();
        
        var tbSFTPHost, tbSFTPPort, tbSFTPMountPoint, tbSFTPUser, tbSFTPPass;
        var tbSFTPRemote;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
        }
        
        var drawn = false;
        function draw(options) {
            if (drawn) return;
            drawn = true;
            
            ui.insertMarkup(options.aml, require("text!./sftp.xml"), plugin);
            
            tbSFTPHost = plugin.getElement("tbSFTPHost");
            tbSFTPPort = plugin.getElement("tbSFTPPort");
            tbSFTPMountPoint = plugin.getElement("tbSFTPMountPoint");
            tbSFTPUser = plugin.getElement("tbSFTPUser");
            tbSFTPPass = plugin.getElement("tbSFTPPass");
            tbSFTPRemote = plugin.getElement("tbSFTPRemote");
        }
        
        /***** Methods *****/
        
        function validate(){
            return true;
        }
        
        function verify(path, callback, retries){
            path = path.replace(/^~/, c9.home);
            if (!retries) retries = 0;
            
            proc.execFile("mount", {}, function(err, stdout, stderr){
                if (!err && stdout.indexOf(path) == -1) {
                    if (++retries < 10)
                        return setTimeout(verify.bind(null, path, callback, retries), 100);
                    
                    err = new Error("Mount is not found: " + path);
                }
                callback(err);
            });
        }
        
        function mount(args, callback){
            if (args.fromUI) {
                args = {
                    user: tbSFTPUser.getValue(),
                    host: tbSFTPHost.getValue(),
                    remote: tbSFTPRemote.getValue(),
                    mountpoint: tbSFTPMountPoint.getValue()
                        .replace(/<hostname>/, tbSFTPHost.getValue()),
                    password: tbSFTPPass.getValue(),
                    port: tbSFTPPort.getValue()
                };
            }
            
            var host = args.user + "@" + args.host + ":" + args.remote;
            var mountpoint = args.mountpoint;
            
            mnt.progress({ caption: "Unmounting..." });
            unmount({ path: mountpoint }, function(err){
                
                mnt.progress({ caption: "Checking Mount Point..." });
                fs.mkdirP(mountpoint, function(err){ // mkdirP doesn't error when dir already exists
                    if (err) return callback(err);
                    
                    var fuseOptions = [
                        "auto_cache", 
                        "transform_symlinks", 
                        "StrictHostKeyChecking=no"
                    ]; //"direct_io" "allow_other", 
                    
                    if (c9.platform == "linux")
                        fuseOptions.push("nonempty");
                    if (args.password)
                        fuseOptions.push("password_stdin");
                    else
                        fuseOptions.push("PasswordAuthentication=no");
                    
                    mnt.progress({ caption: "Mounting..." });
                    proc.spawn(SFTPFS, {
                        args: [
                            host, 
                            mountpoint.replace(/^~/, c9.home),
                            "-o", fuseOptions.join(","),
                            "-p", args.port,
                            "-C"
                        ]
                    }, function(err, process){
                        if (err) return callback(err);
                        
                        if (args.password)
                            process.stdin.write(args.password + "\n");
                        process.stdin.end();
                        
                        var data = "";
                        process.stdout.on("data", function(chunk){
                            if (chunk.match(/yes\/no/))
                                process.stdin.write("yes\n");
                            else 
                                data += chunk;
                        });
                        process.stderr.on("data", function(chunk){
                            if (chunk.match(/yes\/no/))
                                process.stdin.write("yes\n");
                            else 
                                data += chunk;
                        });
                        process.on("exit", function(){
                            var err;
                            
                            if (data.indexOf("execvp()") > -1) {
                                err = new Error("sshfs");
                                err.code = "EINSTALL";
                            }
                            else if (data.indexOf("No such file or directory") > -1)
                                err = new Error("Invalid Directory: " + args.remote);
                            else if (data)
                                err = new Error(data);
                            
                            if (err)
                                return callback(err);
                            
                            mnt.progress({ caption: "Verifying..." });
                            verify(mountpoint, function(err){
                                if (err)
                                    return callback(err);
                                
                                callback(null, {
                                    path: mountpoint,
                                    name: "sftp://" + host,
                                    type: "sftp"
                                });
                            })
                        });
                    });
                });
            })
        }
        
        function unmount(options, callback){
            var PROC = c9.platform == "linux" ? FUSERMOUNT : "umount";
            var path = options.path.replace(/^~/, c9.home);
            proc.execFile(PROC, { args: [path] }, function(err, stdout, stderr){
                if ((err || stderr) && c9.platform == "darwin") {
                    proc.execFile("diskutil", {
                        args: ["unmount", "force", path]
                    }, callback);
                }
                else callback(err);
            });
        }
        
        /***** Lifecycle *****/
        
        plugin.on("draw", function(e){
            draw(e);
        });
        plugin.on("load", function() {
            load();
        });
        plugin.on("unload", function() {
            loaded = false;
            drawn = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * 
         **/
        plugin.freezePublicAPI({
            /**
             * 
             */
            validate: validate,
            
            /**
             * 
             */
            mount: mount,
            
            /**
             * 
             */
            unmount: unmount
        });
        
        register(null, {
            "mount.sftp": plugin
        });
    }
});