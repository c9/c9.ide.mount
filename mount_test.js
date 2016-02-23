/* global describe, it */

"use client"

require(["lib/architect/architect", "lib/chai/chai"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
       
        "plugins/c9.core/ext",
        {
            consumes: ["Plugin"],
            provides: [
                "c9", "tabManager", "MountTab", "proc", "mount", "fs", 
                "metrics", "c9.analytics", "error_handler", "ui",
                "layout", "commands", "Dialog", "menus","dialog.alert",
                "tree.favorites","tree","fs.cache","preferences.experimental","settings","info"
            ],
            setup: expect.html.mocked
        },
        "plugins/c9.ide.mount/mount",
        {
            consumes: ["c9", "mount"],
            provides: [],
            setup: main
        }
    ], architect);

    function main(options, imports, register) {
        var mount = imports["mount"];

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


