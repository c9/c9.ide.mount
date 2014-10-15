define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "ui", "layout", "commands", "Dialog", "menus", 
        "dialog.alert", "tree.favorites", "tree"
    ];
    main.provides = ["mount", "MountTab"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var Dialog = imports.Dialog;
        var ui = imports.ui;
        var tree = imports.tree;
        var commands = imports.commands;
        var menus = imports.menus;
        var favs = imports["tree.favorites"];
        var alert = imports["dialog.alert"].show;
        
        var basename = require("path").basename;
        
        /***** Initialization *****/
        
        var handle = new Dialog("Ajax.org", main.consumes, {
            name: "dialog.mount",
            allowClose: true,
            dark: true,
            title: "Mount",
            width: 400,
            zindex: 100000,
            modal: false,
            custom: true,
            elements: [
                { type: "filler" },
                { type: "button", id: "cancel", caption: "Cancel", onclick: cancel },
                { type: "button", id: "create", color: "green", caption: "Create", onclick: create }
            ]
        });
        
        var emit = handle.getEmitter();
        
        var sections = []; sections.lowest = 100000;
        var body, box, active, loading;
        
        var drawn = false;
        function draw(options) {
            if (drawn) return;
            drawn = true;
            
            body = { html: document.createElement("div") };
            var pNode = options.html.parentNode;
            pNode.replaceChild(body.html, options.html);
            
            var bar = new ui.bar({
                left: "0",
                right: "0",
                top: "-15",
                zindex: 10,
                style: "text-align:center;pointer-events:none",
                childNodes: [
                    box = new ui.hbox({
                        class: "grouped_checkbox_holder with_caption",
                        align: "start",
                        height: "27",
                        style: "display:inline-block !important;pointer-events:all"
                    })
                ]
            });
            
            ui.insertCss(require("text!./mount.css"), 
                options.staticPrefix, handle);
            
            options.aml.parentNode.appendChild(bar);
            
            body.html.innerHTML = '<div class="mount-loading"><span class="loading-spinner"></span><label>Mounting...</label></div>';
            loading = body.html.firstChild;
            loading.style.display = "none";
        }
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            commands.addCommand({
                name: "mount",
                bindKey: { mac: "Command-Option-B", win: "" },
                exec: function(editor, args) {
                    if (args.type) {
                        mount(args.type, args);
                    }
                    else show();
                }
            }, handle);
            
            menus.addItemByPath("File/Mount FTP or SFTP server", new ui.item({
                command: "mount"
            }), 1250, handle);
            
            favs.on("favoriteRemove", function(e){
                if (e.node.mountType)
                    unmount(e.node.mountType, { path: e.node.path });
            });
            
            // tree.getElement("mnuCtxTree", function(mnuCtxTree) {
            //     ui.insertByIndex(mnuCtxTree, new ui.item({
            //         match: "",
            //         caption: "Create a Mount",
            //         command: "mount"
            //     }), 1030, handle);
            // });
        }
        
        /***** Methods *****/
        
        function cancel(){
            handle.hide(); 
            emit("cancel", { });
        }
        
        function create(){
            if (active.plugin.validate())
                mount(null, null, true);
        }
        
        function progress(options){
            loading.style.display = options.complete ? "none" : "block";
            
            if (options.caption)
                loading.lastChild.innerHTML = options.caption;
        }
        
        function mount(type, args, isActive){
            var section = isActive ? active : sections[type]; 
            var plugin = section.plugin;
            
            progress({ caption: "Mounting..." });
            
            plugin.mount(args || { fromUI : true }, function(err, options){
                progress({ complete: true });
                
                if (err) {
                    if (err.code == "EINSTALL") {
                        alert("Failed to create an " + section.name + " Mount",
                            "Please install the " + err.message + " package",
                            "Install the package on an ubuntu system using "
                                + "sudo apt-get install " + err.message 
                                + ". For other systems check out the "
                                + "documentation of your operating system. "
                                + "Please try again after installing this package.");
                    }
                    else {
                        alert("Failed to create an " + section.name + " Mount",
                            "An error occured while creating mount:",
                            err.message);
                    }
                }
                else {
                    handle.hide();
                    
                    // Clean up any old favorite
                    favs.removeFavorite(options.path);
                    
                    // Create new favorite to mount point
                    var favNode = favs.addFavorite(options.path, 
                        options.name + "/" + basename(options.path), true);
                    favNode.mountType = options.type;
                    favNode.excludeFilelist = true;
                    
                    emit("mount", {});
                }
            });
        }
        
        function unmount(type, args, isActive){
            var plugin = isActive ? active.plugin : sections[type].plugin;
            
            plugin.unmount(args, function(){
                handle.hide();
                emit("unmount", {});
            });
        }
        
        function addSection(options, plugin){
            if (!drawn) {
                handle.on("draw", addSection.bind(null, options, plugin));
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
            
            var section = {
                button: btn,
                name: options.name || options.caption,
                plugin: plugin
            };
            sections.push(section)
            sections[section.name] = section;
            
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
            /**
             * 
             */
            cancel: cancel,
            
            /**
             * 
             */
            progress: progress
        });
        
        function MountTab(developer, consumes, options) {
            var plugin = new Plugin(developer, consumes);
            var emit = plugin.getEmitter();
            
            var name = options.name || options.caption;
            var container, aml;
            
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
                
                aml = new ui.bar({ htmlNode: body.html });
                container = aml.$ext;
                plugin.addOther(function(){
                    container.parentNode.removeChild(container);
                });
                
                container.style.padding = "18px 10px 12px 10px";
                
                emit.sticky("draw", { html: container, aml: aml });
            }
            
            /***** Methods *****/
            
            function hide(){
                if (!drawn || !container.parentNode) 
                    return;
                    
                container.parentNode.removeChild(container);
            }
            
            function show(options) {
                draw();
                body.html.appendChild(container);
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
                get container(){ return container; },
                
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