/* global describe, it */

"use client"

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
       
        "plugins/c9.core/ext",
        {
            consumes: ["Plugin"],
            provides: [
                "c9", "tabManager", "MountTab", "proc", "mount", "fs", 
                "metrics", "c9.analytics", "error_handler", "ui"
            ],
            setup: expect.html.mocked
        },
        "plugins/c9.ide.mount/ftp",
        {
            consumes: ["c9", "mount.ftp"],
            provides: [],
            setup: main
        }
    ], architect);

    function main(options, imports, register) {
        var ftp = imports["mount.ftp"];

        describe("ftp", function() {
            
        });
        
        
        onload && onload();
        
        register();
    }
});


