/* global describe, it */

"use client"

require(["lib/architect/architect", "lib/chai/chai"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
       
        "plugins/c9.core/ext",
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
            it("should provide mount interface", function() {
                expect(sftp.mount).ok;
                expect(sftp.verify).ok;
            });
        });
        
        
        onload && onload();
        
        register();
    }
});


