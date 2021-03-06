console.log('Make sure to run npm install after every update to check for new dependencies!');
var dgram = require('dgram');
var dns = require('dns');
var check = require('validator').check
var EventEmitter = require('events').EventEmitter;
var utils = require('./utils');
var packet = require('./packet').packet;
var nconf = utils.config.nconf;
var ipArray = { };
var client = dgram.createSocket("udp4");
var proxy = new EventEmitter();
var serverip;
var serverPort;
//Modules to make debugging easier
try
{
    //Appends file and line numbers to console output
    require('console-trace')({
        always: true,
        cwd: __dirname
    })
    //Longer Stacktraces
    require('longjohn');
}
catch(err)
{}

//Set default config values for proxy
nconf.defaults({
    'serverPort': 19132,
    'proxyPort': 19133,
    'interface': {
        'cli': true,
        'webserver': false
    },
    'dev': false
});
proxy.on('dnsLookup', function()
{
    dns.lookup(nconf.get('serverip'), function(err, address, family)
    {
        if (err !== null)
        {
            if (err.code === 'ENOTFOUND')
            {
                utils.logging.logerror('Domain not found')
                process.exit(1);
            }
            else
            {
                utils.logging.logerror('Unknown error: ' + err.code);
                process.exit(1);
            }
        }
        proxy.emit('setConfig', address);
    });
});

proxy.on('setConfig', function(address)
{
    //Proxy settings
    nconf.set('serverip', nconf.get('serverip'));
    nconf.set('serverPort', nconf.get('serverPort'));
    nconf.set('proxyPort', nconf.getInt('proxyPort'));
    //Interface settings
    nconf.set('interface:webserver', nconf.getBoolean('interface:webserver'));
    nconf.set('interface:cli', nconf.getBoolean('interface:cli'));
    //Developer Mode
    nconf.set('dev', nconf.getBoolean('dev'));

    serverip = address;
    serverPort = nconf.get('serverPort');

    nconf.save();

    proxyStart();

});

utils.logging.on('logerror', function(msg)
{
    console.error('[ERROR]: ' + msg);
});

proxyConfigCheck();

utils.config.on('serverChange', function(msg)
{
    serverip = msg.serverip;
    serverPort = parseInt(msg.serverPort);
    nconf.set('serverip', serverip);
    nconf.set('serverPort', serverPort);
    if (msg.proxyPort != nconf.get('proxyPort'))
    {
        client.close();
        nconf.set('proxyPort', parseInt(msg.proxyPort))
        client = dgram.createSocket("udp4");
        proxyStart();
    }
});

function proxyStart()
{
    client.bind(nconf.get('proxyPort'));
    client.on("message", function(msg, rinfo)
    {
        packetReceive(msg, rinfo);
    });
    if (nconf.get("interface:cli") == true)
    {
        var cli = require('./cli').cli;
        cli.start();
    }
    if (nconf.get("interface:webserver") == true)
    {
        var webserver = require('./webserver').webserver;
        webserver.start();
    }
    utils.logging.info("Proxy listening on port: " + nconf.get('proxyPort'))
    utils.logging.info("Forwarding packets to: " + serverip + ":" +
        nconf.get('serverPort'));
}

function proxyConfigCheck()
{
    if (!utils.misc.isNumber(nconf.get('serverPort')))
    {
        utils.logging.logerror('Port specified for --serverPort is not a number')
        process.exit(1);
    }
    if (!utils.misc.isNumber(nconf.get('proxyPort')))
    {
        utils.logging.logerror('Port specified for --proxyPort is not a number')
        process.exit(1);
    }
    if (typeof(nconf.get('serverip')) === 'undefined')
    {
        utils.logging.logerror('No server ip set. Set one with --serverip <server ip> (only'
        + ' needed on first launch or when changing ips)');
        process.exit(1);
    }
    try
    {
        //check() throws an error on invalid input
        check(nconf.get('serverip')).isIP();
        proxy.emit('setConfig', nconf.get('serverip'));
    }
    catch (err)
    {
        check(nconf.get('serverip'), "Enter a valid IP or hostname (hostnames like localhost"
        + " are not supported)").isUrl();
        proxy.emit('dnsLookup');
    }
}

function packetReceive(msg, rinfo, sendPort)
{
    type = msg.toString('hex').substr(0,2)
    if (rinfo.address !== serverip)
    {
        var portTime = new Date();
        if (typeof(ipArray[rinfo.port]) === 'undefined')
        {
            ipArray[rinfo.port] = { 'port': rinfo.port, 'ip': rinfo.address,
                'time': portTime.getTime(), 'socket': dgram.createSocket("udp4")};
            ipArray[rinfo.port].socket.bind(rinfo.port);
            ipArray[rinfo.port].socket.on("message", function(msgg, rinfoo)
            {
                packetReceive(msgg, rinfoo, ipArray[rinfo.port]['port']);
            });
        }
        else
        {
            ipArray[rinfo.port]['time'] = portTime.getTime();
        }
    }
    if (rinfo.address !== serverip)
    {
        packet.log(rinfo.address, rinfo.port, serverip, serverPort, msg);
        ipArray[rinfo.port].socket.send(msg, 0, msg.length, serverPort,
            serverip);
    }
    //Without checking the port, the proxy will crash if the server acts like a client
    else if (rinfo.port == serverPort)
    {
        var currentTime = new Date().getTime();
        //Measured in milliseconds
        //FIXME: Use setInterval to check for timed out devices
        if ((currentTime - ipArray[sendPort]['time']) > 30000)
        {
            utils.logging.debug("No packets from " + ipArray[sendPort]['ip'] + ":" +
                ipArray[sendPort]['port'] + ", removing device");
            ipArray[sendPort].socket.close();
            delete ipArray[sendPort];
        }
        else
        {
            packet.log(rinfo.address, rinfo.port, ipArray[sendPort]['ip'],
                ipArray[sendPort]['port'], msg);
            client.send(msg, 0, msg.length, ipArray[sendPort]['port'], ipArray[sendPort]['ip']);
        }
    }
}

process.on('SIGINT', function()
{
    console.info("Shutting down proxy.");
    nconf.save(function (err)
    {
        if (err)
        {
            utils.logging.logerror("Error saving config: " + err);
        }
        process.exit();
    });
});
