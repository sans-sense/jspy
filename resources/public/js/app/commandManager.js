define(["app/datasource", "promise", "app/eventBus"], function(ds, Promise, eventBus){
    var currentlyAttaching = false;
    var currentVM = null;
    var commandRegistry = {};

    function CommandResult(promise) {
        return {
            promise : promise,
            onSuccess: function(callBack) {
                this.promise.then(callBack, null);
                return this;
            },
            onFailure: function(callBack) {
                this.promise.then(null, this.callBack);
                return this;
            }
        }
    }

    function runCommand(cmdName, param) {
        // just in case someone changes it once the command start
        var vmId = currentVM;
        var cmd = commandRegistry[cmdName];
        if (cmd) {
            return new CommandResult(cmd.operation.call(this, param, vmId));
        } else {
            throw new Error("Command name " +cmdName+" not recognized");
        }
    }

    function runCommandOnVM(fulfill, reject, command, vmId) {
        ds.forJSON("/vms/command", {'vmId': vmId, 'command':command}, 'POST')
            .then(function(data) {
                ds.forJSON("/vms/response?vmId="+vmId, '','GET', true)
                    .then(function(data) {fulfill(data)}, function(){reject("command " + command + " on vm "+vmId + "could not be completed successfully")});
            });
        
    }

    function setCurrentVM(vmId) {
        currentVM = '' + vmId;
    }

    function registerCommand(name, operation, helpMsg) {
        commandRegistry[name] = {
            "name" : name,
            "help": helpMsg,
            "operation": function(param, vmId) {
                var promise = new Promise(function(fulfill, reject) {
                    if (operation) {
                        operation.call(this, fulfill, reject, param, vmId);
                    } else {
                        runCommandOnVM(fulfill, reject, name + '()', currentVM);
                    }
                });
                return promise;
            }
        }
        eventBus.emit('commandRegistered', {'name': name});
    }

    registerCommand("attachToVM",
                    function attachToVM(fulfill, reject, vmId) {
                        // interpreting params as vmId
                        if (currentlyAttaching === false) {
                            currentlyAttaching = true;
                            ds.forJSON("/vms/attach", {'vmId': '' + vmId}, 'POST')
                                .then(function(data) {
                                    currentlyAttaching = false;
                                    currentVM = vmId;
                                    fulfill(vmId);
                                }, function() {
                                    currentlyAttaching = false;
                                    reject("attach failed");
                                });
                        } else {
                            reject("In middle of attach");
                        }
                    },
                    "Attach to the VM");


    registerCommand("detachFromVM", 
                    function detachFromVM(fulfill, reject, param, vmId) {
                        ds.forJSON("/vms/detach", {'vmId': ''+vmId}, 'POST')
                            .then(function(data){fulfill(data)})
                    },
                    "Detach from the VM");

    registerCommand("listAttachedVMs",
                    function listAttachedVMs(fulfill, reject) {
                        ds.forJSON("/vms/attached")
                            .then(function(data){fulfill(data)});
                    },
                    "List all VMs on this machine");

    registerCommand("direct", runCommandOnVM, "Run the passed param on VM");

    registerCommand("listVMs",
                    function listAttachedVMs(fulfill, reject) {
                        ds.forJSON("/vms")
                            .then(function(data){fulfill(data)});
                    },
                    "list all the vms currently present");

    registerCommand("dumpThreads", null, "Show thread dump");
    registerCommand("getClassLocations", null, "Show class locations");
    registerCommand("dumpThreadNames", null, "Show thread names");

    function getDirectCommandWraper(cmdName) {
        return function(fulfill, reject) {
            runCommandOnVM(fulfill, reject, cmdName + '()', currentVM);
        }
    }

    return {
        "registerCommand" : registerCommand,
        "runCommand":runCommand,
        "setCurrentVM" : setCurrentVM,
        "getCommands" : function() {
            var commands = [];
            for (var el in commandRegistry) {
                commands.push(commandRegistry[el]);
            }
            return commands;
        }
    }
});
