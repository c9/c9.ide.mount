/* global describe, it */

"use client"

require(["lib/architect/architect", "lib/chai/chai", "events"], 
  function (architect, chai, events, baseProc) {
    var expect = chai.expect;
    
    var existingMounts = {
        '~/mounts/TestMount': {
            mountType: "sftp",
            mountOptions: {
                port: 123 
            }
        }
    };
    
    expect.setupArchitectTest([
        "plugins/c9.core/ext",
        {
            consumes: ["Plugin"],
            provides: [
                "c9", "tabManager", "MountTab", "proc", "mount", "fs", 
                "metrics", "c9.analytics", "error_handler", "ui",
                "layout", "commands", "Dialog", "menus","dialog.alert",
                "tree","fs.cache","preferences.experimental","settings","info"
            ],
            setup: expect.html.mocked
        },
        {
            consumes: ["Plugin"],
            provides: ["tree.favorites"],
            setup: function (options, imports, register) {
                register(null, {
                    "tree.favorites": (function(){
                        var tree = new events.EventEmitter();
                        tree.addFavorites = function(){};
                        tree.getFavoritePaths = function(){ return [] };
                        tree.favorites = Object.keys(existingMounts);
                        tree.isFavoritePath = function(path) { return existingMounts[path]; };
                        return tree;
                    })(),
                })
            }
        },
        {
            packagePath: "plugins/c9.ide.mount/mount",     
            testing: true   
        },
        {
            consumes: ["c9", "mount"],
            provides: [],
            setup: main
        }
    ], architect);

    function main(options, imports, register) {
        var mount = imports["mount"];

        describe("load", function() {
            it("Should add mounts in favorites to existingMounts list", function() {
                var pluginExistingMounts = mount.existingMounts;
                expect(pluginExistingMounts.length).to.equal(1);
                expect(pluginExistingMounts[0].mountType).to.equal("sftp");
                console.log("pluginExistingMounts: ", pluginExistingMounts);
            });
        });
        
        describe("ftp", function() {
            describe("sanitizeLoginInformation", function() {
                it("Should urlencode @ and ,", function() {
                    expect(mount.sanitizeLoginInformation("abc@def")).to.equal("abc%40def");
                    expect(mount.sanitizeLoginInformation(",lala")).to.equal("%2Clala");
                });
            });
        });
        
        onload && onload();
        
        register();
    }
});


