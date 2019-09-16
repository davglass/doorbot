#!/usr/bin/env node

/*
 *
 * To use this: npm install async mkdirp request dateformat doorbot 
 *
 * To run this: node download.js
 * To run this: node download.js <OlderThanID>
 *
 */

//Includes 
const dateFormat = require('dateformat');
const RingAPI = require('doorbot');
const async = require('async');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const url = require('url');
const request = require('request');

const ring = RingAPI({
    email: 'EMAILADDRESS',
    password: 'PASSWORD'
});

/*
 * Script Settings
 *
 * loopForOlder - If true, once the 100 max items are returned from the API, we get the next 100, repeating until the API returns no more items
 *
 * skipExistingFiles - If true, we don't download files that we already have a local copy of (based on Device ID, Video ID and CreatedAt date) - if false, we re-download and overwrite any existing files on disk.
 *
 */


var loopForOlder = true;
var skipExistingFiles = true;


//Parse 1st command line argument to take in the ID of what we want this to be older than, otherwise start with most recent
var olderthan = process.argv[2];

//Variables for tracking what the oldest file in a run is, as well as the previous oldest-file we started at, to determine when we are no longer receiving additional older files anymore
var oldestFile = parseInt('9999999999999999999'); //Expected max file ID
var lastOldest = olderthan;

const base = path.join(__dirname, 'downloads');

fs.mkdir(base, () => { //ignoring if it exists..
    const doAgain = (goBack) => {	
        //Implements the get-next-100-oldest feature
        if (goBack !== null) {
            olderthan = goBack;
            console.log('Getting more, older than: ' + olderthan);
        }
	
        //First value is HistoryLimit, max return is 100 so I hardcoded 1000 to make sure this number is bigger than what the API returns
        ring.history(1000, olderthan, (e, history) => {
            const fetch = (info, callback) => {
                ring.recording(info.id, (e, recording) => {
                    //Calculate the filename we want this to be saved as
                    const datea = dateFormat(info['created_at'],"yyyymmdd_HHMMssZ");
		 // Constructed path ended in _stamp.mp4 which broke the file ID. Changed offset from -4 to -10 to remove string chars.
		 // const partFilePath = url.parse(recording).pathname.substring(0,url.parse(recording).pathname.length - 4);
                    const partFilePath = url.parse(recording).pathname.substring(0,url.parse(recording).pathname.length - 10);
                    const parts = partFilePath.split('/');
                    const filePath = '/' + parts[1] + '/' + datea + '_' + parts[2] + '.mp4';
                    const file = path.join(base, '.', filePath);
					
                    //Is the file we just processed an older File ID than the previous file ID?
                    if (parts[2] < oldestFile) {
                        oldestFile = parts[2];
                    }
	
                    //Make sure the directory exists
                    const dirname = path.dirname(file);
                    mkdirp(dirname, () => {
                        //Tracking variable
                        var writeFile = true;
        
                        //Test if the file we are about to write already exists
                        try {
                            fs.accessSync(file);
                            console.log('File Exists, Skipping: ', file);
                            writeFile = false;
                        } catch (err) {
                            writeFile = true;
                        }
                        
                        //If we aren't skipping existing files, we write them regardless of the write-file value
                        if (skipExistingFiles && !writeFile) {
                            return callback();
                        }
        
                        console.log('Fetching file', file);
                        const writer = fs.createWriteStream(file);
                        writer.on('close', () => {
                            console.log('Done writing', file);
                            callback();
                        });
                        request(recording).pipe(writer);
                    });
                });
            };
	
            async.eachLimit(history, 10, fetch, () => {
                console.log('Done, Oldest File: ' + oldestFile);
				
                //If we started at the most recent video and don't have an existing oldest, or if we found a new, older Video ID, we start the look again from there - assuming loopForOlder is true
                if ((lastOldest === null || lastOldest !== oldestFile) && loopForOlder) {
                    lastOldest = oldestFile;
                    doAgain(lastOldest); //If we could a new oldest file, start again from there
                }
            });
        });    
    };
    doAgain(null); //Initially start it
});
