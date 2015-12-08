define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "ui", "layout", "commands", "Dialog", "menus", 
        "dialog.alert", "tree.favorites", "tree", "c9", "fs.cache",
        "metrics", "c9.analytics", "error_handler", "preferences.experimental",
        "settings", "info"
    ];
    main.provides = ["mount", "MountTab"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var Dialog = imports.Dialog;
        var c9 = imports.c9;
        var ui = imports.ui;
        var tree = imports.tree;
        var info = imports.info;
        var commands = imports.commands;
        var menus = imports.menus;
        var favs = imports["tree.favorites"];
        var fsCache = imports["fs.cache"];
        var alert = imports["dialog.alert"].show;
        var errorHandler = imports.error_handler;
        var metrics = imports.metrics;
        var analytics = imports["c9.analytics"];
        var experimental = imports["preferences.experimental"];
        var basename = require("path").basename;
        var settings = imports.settings;
        var GRANDFATHERED_USER_DATE = new Date("2015-11-15").getTime();
        var _ = require("lodash");
        var oberr = require("c9/oberr");
        
        /***** Initialization *****/
        
        var handle = new Dialog("Ajax.org", main.consumes, {
            name: "dialog.mount",
            allowClose: true,
            dark: true,
            title: "Mount",
            width: 400,
            zindex: 100000,
            modal: true,
            elements: [
                { type: "filler" },
                { type: "button", id: "cancel", caption: "Cancel", onclick: cancel },
                { type: "button", id: "create", color: "green", caption: "Create", onclick: create }
            ]
        });
        
        var emit = handle.getEmitter();
        
        var CANCELERROR = -1;
        
        var sections = []; sections.lowest = 100000;
        var mounting = {};
        var container, box, active, loading;
        
        var drawn = false;
        function draw(options) {
            if (drawn) return;
            drawn = true;
            
            container = options.html;
            
            var bar = new ui.bar({
                left: "0",
                right: "0",
                top: "-15",
                zindex: 10,
                style: "text-align:center;pointer-events:none",
                childNodes: [
                    box = new ui.hbox({
                        class: "grouped_checkbox_holder with_caption mount",
                        align: "start",
                        height: "27",
                        style: "display:inline-block !important;pointer-events:all"
                    })
                ]
            });
            
            ui.insertCss(require("text!./mount.css"), 
                options.staticPrefix, handle);
            
            options.aml.parentNode.appendChild(bar);
            
            container.innerHTML = '<div class="mount-loading"><span class="loading-spinner"></span><label>Mounting...</label></div>';
            loading = container.firstChild;
            loading.style.display = "none";
            
            handle.on("hide", function(){
                loading.style.display = "none";
                handle.update([{ id:"cancel", zindex:"" }]);
            });
        }
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            favs.on("favoriteRemove", function(e){
                if (e.node.mountType)
                    unmount(e.node.mountType, { path: e.node.path });
            });
            
            fsCache.on("readdir", function(e){
                var node = favs.isFavoritePath(e.path);
                if (node && node.mountType) {
                    if (!Object.keys(e.parent.map).length) {
                        var options = node.mountOptions;
                        var plugin = (sections[node.mountType] || 1).plugin;
                        if (!plugin) return; // Do Nothing
                        
                        plugin.verify(options.mountpoint, function(err){
                            if (!err) return;
                            
                            // Mount doesn't exist anymore, let's create it
                            mount(node.mountType, options, {remount: true}, function(err){
                                if (err) return;
                                
                                tree.refresh([node], function(){
                                    tree.expand(node);
                                });
                            });
                        }, -1); // Only test once
                    }
                }
            });
            
            tree.on("menuUpdate", function(e){
                var caption = e.node && e.node.mountType
                    ? "Remove Mount"
                    : "Remove from Favorites";
                
                e.menu.childNodes.some(function(item) {
                    if (item.command == "removefavorite") {
                        item.setAttribute("caption", caption);
                        return true;
                    }
                });
            });
            
            // tree.getElement("mnuCtxTree", function(mnuCtxTree) {
            //     ui.insertByIndex(mnuCtxTree, new ui.item({
            //         match: "",
            //         caption: "Create a Mount",
            //         command: "mount"
            //     }), 1030, handle);
            // });
            loadUI();
        }
        
        function loadUI() {
            settings.on("read", function(){
                settings.setDefaults("user/mount", [
                    ["grandfathered-shown", false],
                ]);
            }, handle);
            
            var isGrandfatheredShown = settings.get("user/mount/grandfathered-shown");
            if (!isExperimentEnabled() && (!isGrandfatheredUser() || isGrandfatheredShown))
                return;
            
            commands.addCommand({
                name: "mount",
                bindKey: { mac: "Command-Option-B", win: "" },
                exec: function(editor, args) {
                    checkGrandfatheredUser(function() {
                        if (args.type) {
                            startMount(args.type, args);
                        }
                        else show();
                    });
                }
            }, handle);
            
            menus.addItemByPath("File/Mount FTP or SFTP server...", new ui.item({
                command: "mount"
            }), 1250, handle);
        }
        
        /***** Methods *****/
        
        function checkGrandfatheredUser(useFeature) {
            if (!isGrandfatheredUser() || isExperimentEnabled())
                return useFeature();
            
            // Disable the feature next session
            settings.set("user/mount/grandfathered-shown", true);
            
            alert(
                "Mount",
                "The Mount feature is considered experimental.",
                "We introduced a new preferences panel for experimental features! "
                + "To try the Mount feature or any other of our experiments, "
                + "please enable it feature first in <b>Cloud9 &gt; Preferences &gt; Experimental</b>.",
                null,
                { isHTML: true }
            );
        }
        
        function isGrandfatheredUser() {
            return info.getUser().date_add < GRANDFATHERED_USER_DATE;
        }
        
        function isExperimentEnabled() {
            return experimental.addExperiment("mount", false, "Files/(S)FTP Mounting");
        }
        
        function cancel(){
            handle.hide();
            active.plugin.cancel();
            emit("cancel", {});
        }
        
        function create(){
            if (active.plugin.validate())
                startMount(active.name);
        }
        
        function progress(options){
            if (!loading) return;
            
            loading.className = "mount-loading";
            loading.style.display = options.complete ? "none" : "block";
            
            handle.update([{ id:"cancel", zindex:10000 }]);
            
            if (options.caption)
                loading.lastChild.innerHTML = options.caption;
        }
        
        function error(options){
            loading.className = "mount-loading error";
            loading.style.display = "block";
            
            handle.update([{ id:"cancel", zindex:"" }]);
            
            if (options.caption)
                loading.lastChild.innerHTML = options.caption;
        }
        
        function startMount(type) {
            // Get the arguments here as we want whatever arguments were filled out passed to sftp then ftp.
            var plugin = sections[type].plugin;
            var args = plugin.getArgsFromUI();
            
            
            // If we are mounting ftp on port 21 attempt to mount sftp first, if that fails mount with ftp
            if (type == "ftp" && (args.port == 21 || args.port == 22)) {
                var sftpArgs = _.extend({}, args, {port: 22});
                mount("sftp", sftpArgs, {silent: true}, function (err) {
                    if (err) {
                        // sftp mounting failed, lets try again with our original mount type
                        mount(type, args);
                    }
                });
            }
            else {
                mount(type, args);
            }
        }
      
      
        function mount(type, args, options, callback){
            options = options || {};
            var remount = !!options.remount;
            var silent = !!options.silent;
            var section = sections[type]; 
            var plugin = section.plugin;
            
            if (!args)
                args = { fromUI : true };
            else if (mounting[args.mountpoint])
                return done(new Error("Already mounting this mountpoint"));
            
            mounting[args.mountpoint] = true;
            progress({ caption: "Mounting..." });
            
            function done(err){
                delete mounting[args.mountpoint];
                callback && callback(err);
            }
            
            plugin.mount(args, function(err, options){
                progress({ complete: true });
                
                if (err) {
                    if (err == CANCELERROR)
                        return done(err);
                    
                    errorHandler.log(new Error("Failed to create mount"), {mountError: oberr(err), type: type, args: args, options: options})
                    
                    var word = remount ? "refresh" : "create";
                    if (err.code == "EINSTALL") {
                        analytics.log("Was asked to install package before mounting");
                        !silent && alert("Failed to " + word + " an " + section.name + " Mount",
                            "Please install the " + err.message + " package",
                            "Install the package on an ubuntu system using "
                                + "sudo apt-get install " + err.message 
                                + ". For other systems check out the "
                                + "documentation of your operating system. "
                                + "Please try again after installing this package.");
                    }
                    else if (err.code == "EACCESS") {
                        !silent && alert("Failed to " + word.toUpperCase() + " an " + section.name.toUpperCase() + " Mount",
                            "Please verify your Username/Password",
                            err.message);
                    }
                    else {
                        metrics.increment("mount.failed");
                        !silent && alert("Failed to " + word.toUpperCase() + " an " + section.name.toUpperCase() + " Mount",
                            "An error occurred while creating the mount:",
                            err.message);
                    }
                }
                else {
                    if (!remount) {
                        handle.hide();
                        
                        // Clean up any old favorite
                        favs.removeFavorite(options.path);
                        
                        // Create new favorite to mount point
                        var favNode = favs.addFavorite(options.path, 
                            options.name + "/" + basename(options.path), true);
                        favNode.mountType = options.type;
                        favNode.mountOptions = options.args;
                        favNode.excludeFilelist = true;
                    }
                    
                    metrics.increment("mount");
                    analytics.log("Mounted volume", {
                        path: options.path,
                        type: options.type
                    });
                    
                    emit("mount", {});
                }
                
                done(err);
            });
        }
        
        function unmount(type, args, options, callback){
            var plugin = sections[type].plugin;
            
            plugin.unmount(args, function(){
                handle.hide();
                emit("unmount", {});
                callback && callback();
            });
        }
        
        function addSection(options, plugin, section){
            if (!section) {
                section = {
                    name: options.name || options.caption,
                    plugin: plugin
                };
                sections.push(section)
                sections[section.name] = section;
            };
            
            if (!drawn) {
                handle.on("draw", addSection.bind(null, options, plugin, section));
                return;
            }
            
            var btn = new ui.checkbox({
                label: options.caption,
                skin: "grouped_checkbox",
                "onmousedown": function(){
                    activate(section);
                    btn.$refKeyDown--;
                }
            });
            
            ui.insertByIndex(box, btn, options.index, plugin);
            
            section.button = btn;
            
            if (options.index < sections.lowest) {
                sections.lowest = options.index;
                activate(section);
            }
            
            return section;
        }
        
        function activate(section){
            if (typeof section == "string")
                section = sections[section];
            
            active = section;
            
            sections.forEach(function(s){
                if (!s.button) return;
                if (s != section)
                    s.button.uncheck();
                else
                    s.button.check();
            });
            
            emit("activate", { section: section });
            
            // Focus first element
            var nodes = section.plugin.aml.getElementsByTagName("*");
            nodes.some(function(node){
                if (node.focussable) {
                    node.focus();
                    return true;
                }
            });
        }
        
        function show(reset, options) {
            analytics.log("Opened mount dialog");
            
            if (!options)
                options = {};
            
            return handle.queue(function(){
                // if (reset || current == -1) {
                //     path = [startPage];
                //     current = 0;
                //     activate(startPage);
                // }
                    
            }, true);
        }
        
        /***** Lifecycle *****/
            
        handle.on("draw", function(options) {
            draw(options);
        });
        handle.on("load", function() {
            load();
        });
        handle.on("enable", function() {
            
        });
        handle.on("disable", function() {
            
        });
        handle.on("unload", function() {
            loaded = false;
            drawn = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * 
         */
        handle.freezePublicAPI({
            CANCELERROR: CANCELERROR,
            
            events: [
                /**
                 * 
                 */
                "cancel",
                /**
                 * 
                 */
                "mount",
                /**
                 * 
                 */
                "unmount",
                /**
                 * 
                 */
                "activate",
            ],
            
            /**
             * 
             */
            cancel: cancel,
            
            /**
             * 
             */
            progress: progress,
            
            /**
             * 
             */
            error: error
        });
        
        function MountTab(developer, consumes, options) {
            var plugin = new Plugin(developer, consumes);
            var emit = plugin.getEmitter();
            
            var name = options.name || options.caption;
            var htmlPage, aml;
            
            // Create UI Button
            handle.on("activate", function(e){
                if (e.section.name == name)
                    show();
                else
                    hide();
            });
            
            var drawn;
            function draw(){
                if (drawn) return;
                drawn = true;
                
                aml = new ui.bar({ htmlNode: container });
                htmlPage = aml.$ext;
                plugin.addOther(function(){
                    htmlPage.parentNode.removeChild(htmlPage);
                });
                
                htmlPage.className = "basic mount-container";
                
                emit.sticky("draw", { html: htmlPage, aml: aml });
            }
            
            /***** Methods *****/
            
            function hide(){
                if (!drawn || !htmlPage.parentNode) 
                    return;
                    
                htmlPage.parentNode.removeChild(htmlPage);
            }
            
            function show(options) {
                draw();
                container.host.appendChild(htmlPage.host);
            }
            
            /***** Register and define API *****/
            
            plugin.on("load", function(){
                addSection(options, plugin);
            });
            
            plugin.freezePublicAPI.baseclass();
            
            /**
             * 
             */
            plugin.freezePublicAPI({
                /**
                 * 
                 */
                get mountType(){ return name; },
                
                /**
                 * 
                 */
                get aml(){ return aml; },
                
                /**
                 * 
                 */
                get container(){ return htmlPage; },
                
                /**
                 * 
                 */
                show: show,
                
                /**
                 * 
                 */
                hide: hide
            });
            
            return plugin;
        }
        
        register(null, {
            mount: handle,
            MountTab: MountTab
        });
    }
});