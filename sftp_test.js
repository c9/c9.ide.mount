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
                "metrics", "c9.analytics", "error_handler", "ui"
            ],
            setup: expect.html.mocked
        },
        "plugins/c9.ide.mount/sftp",
        {
            consumes: ["c9", "mount.sftp"],
            provides: [],
            setup: main
        }
    ], architect);

    function main(options, imports, register) {
        var sftp = imports["mount.sftp"];

        describe("sftp", function() {
            
        });
        
        
        onload && onload();
        
        register();
    }
});


