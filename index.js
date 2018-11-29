const config = require('./config.json');
const Discord = require('discord.js');
const client = new Discord.Client();
const request = require('request');
const querystring = require('querystring');
const io = require('socket.io-client');

const oauthTokenUrl = 'https://mtxserv.com/oauth/v2/token?';
const invoiceApiUrl =
	'https://mtxserv.com/api/v1/invoices/' + config.invoice_id;

const authParams = {
	grant_type: 'https://mtxserv.com/grants/api_key',
	client_id: config.mtxserv_client_id,
	client_secret: config.mtxserv_client_secret,
	api_key: config.mtxserv_api_key,
};

const getAccessToken = function(params, callback) {
	request(
		{
			url: oauthTokenUrl + querystring.stringify(params),
			json: true,
			followRedirect: false,
		},
		function(error, response, body) {
			if (
				null !== error ||
				response.statusCode !== 200 ||
				typeof body.access_token === 'undefined'
			) {
				console.log(
					"Can't retrieve access_token data, check your credentials (" +
						response.statusCode +
						' ' +
						(error !== null ? error : '') +
						')',
				);
				return;
			}

			callback(body.access_token);
		},
	);
};

const streamConsole = function(invoice, channel) {
	const socket = io('https://' + invoice.host + ':8181', {
		'force new connection': true,
	});

	socket.on('connected', function() {
		socket.emit('start', {
			invoiceId: invoice.id,
			hash: invoice.security_hash,
		});
	});

	socket.on('initialTextData', function() {
		socket.removeAllListeners('continuousTextData');
		socket.on('continuousTextData', function(data) {
			if (typeof data.text === 'undefined') {
				return;
			}

			channel.send(data.text);
		});
	});
};

getAccessToken(authParams, function(accessToken) {
	request(
		{
			url: invoiceApiUrl + '?access_token=' + accessToken,
			json: true,
		},
		function(error, response, body) {
			if (null !== error || response.statusCode !== 200) {
				console.log(
					"Can't retrieve invoice (" +
						response.statusCode +
						' ' +
						(error !== null ? error : '') +
						')',
				);
				return;
			}

			const invoice = body;

			client.on('ready', () => {
				console.log(`Logged in as ${client.user.tag}!`);
				if (!client.channels.has(config.discord_channel_id)) {
					throw new Error(
						`Channel with ID ${
							config.discord_channel_id
						} not found`,
					);
				}

				const channel = client.channels.get(config.discord_channel_id);
				console.log(
					`Start to stream gameserver console (GSID: #${
						invoice.gsid
					}) on channel "${channel.name}"`,
				);

				streamConsole(invoice, channel);
			});

			client.login(config.discord_bot_token);
		},
	);
});
