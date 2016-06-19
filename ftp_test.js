/* global describe, it */

"use client"

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
       
        "plugins/c9.core/ext",
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
            it("should provide mount interface", function() {
                expect(ftp.mount).ok;
                expect(ftp.verify).ok;
            });
        });
        
        
        onload && onload();
        
        register();
    }
});


