define(function(require, exports, module) {
    main.consumes = [
        "MountTab", "ui", "proc", "c9", "dialog.alert", "mount", "fs"
    ];
    main.provides = ["mount.ftp"];
    return main;

    function main(options, imports, register) {
        var MountTab = imports.MountTab;
        var ui = imports.ui;
        var proc = imports.proc;
        var alert = imports["dialog.alert"].show;
        var c9 = imports.c9;
        var fs = imports.fs;
        var mnt = imports.mount;
        
        var FTPFS = "curlftpfs";
        
        /***** Initialization *****/
        
        var plugin = new MountTab("", "", { 
            caption: "FTP", 
            name: "ftp", 
            index: 100
        });
        // var emit = plugin.getEmitter();
        
        var tbFTPHost, tbFTPPort, tbFTPMountPoint, tbFTPUser, tbFTPPass, tbFTPRemote;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
        }
        
        var drawn = false;
        function draw(options) {
            if (drawn) return;
            drawn = true;
            
            ui.insertMarkup(options.aml, require("text!./ftp.xml"), plugin);
            
            tbFTPHost = plugin.getElement("tbFTPHost");
            tbFTPPort = plugin.getElement("tbFTPPort");
            tbFTPMountPoint = plugin.getElement("tbFTPMountPoint");
            tbFTPUser = plugin.getElement("tbFTPUser");
            tbFTPPass = plugin.getElement("tbFTPPass");
            tbFTPRemote = plugin.getElement("tbFTPRemote");
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
                    user: tbFTPUser.getValue(),
                    pass: tbFTPPass.getValue(),
                    host: tbFTPHost.getValue(),
                    remote: tbFTPRemote.getValue(),
                    mountpoint: tbFTPMountPoint.getValue(),
                    port: tbFTPPort.getValue()
                };
            }
            
            var host = "ftp://" + args.user + ":" + args.pass 
                + "@" + args.host + (args.port ? ":" + args.port : "")
                + args.remote;
            var mountpoint = args.mountpoint;
            
            mnt.progress({ caption: "Unmounting..." });
            unmount({ path: mountpoint }, function(err){
                
                mnt.progress({ caption: "Checking Mount Point..." });
                fs.mkdirP(mountpoint, function(err){ // mkdirP doesn't error when dir already exists
                    if (err) return callback(err);
                    
                    var fuseOptions = ["auto_cache", "transform_symlinks"]; //"direct_io" "allow_other", 
                    if (c9.platform == "linux")
                        fuseOptions.push("nonempty");
                    
                    mnt.progress({ caption: "Mounting..." });
                    proc.spawn(FTPFS, {
                        args: [
                            host, 
                            mountpoint.replace(/^~/, c9.home),
                            "-o", fuseOptions.join(",")
                        ]
                    }, function(err, process){
                        if (err) return callback(err);
                        
                        var data = "";
                        process.stdout.on("data", function(chunk){
                            if (chunk)
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
                            
                            if (data.indexOf("No such file or directory") > -1)
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
                                    name: "ftp://" + host
                                });
                            })
                        });
                    });
                });
            })
        }
        
        // "hard_remove"
        function unmount(options, callback){
            var PROC = c9.platform == "linux" ? "fusermount" : "umount";
            var path = options.path.replace(/^~/, c9.home);
            proc.execFile(PROC, { args: [path] }, callback);
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
            "mount.ftp": plugin
        });
    }
});