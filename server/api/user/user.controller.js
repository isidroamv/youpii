'use strict';

var User = require('./user.model');
var config = require('../../config/environment');
var City = require(config.root+'/server/api/city/city.model');
var images = require(config.root+'/server/components/images');
var s3 = require(config.root+'/server/components/s3');
var jwt = require('jsonwebtoken');
var _ = require('lodash');


var validationError = function(res, err) {
  return res.json(422, err);
};

/**
 * Get list of users
 * restriction: 'admin'
 */
exports.index = function(req, res) {
  User.find({}, '-salt -hashedPassword', function (err, users) {
    if(err) return res.send(500, err);
    res.json(200, users);
  });
};

/**
 * Creates a new user
 */
exports.create = function (req, res, next) {

  console.log(req.files);
  console.log(req.body);
  var imageDesc = [];
  var splitName = '';
  var uploader = [], uploader2 = [];

  req.body.visibleEmail = req.body.visibleEmail || false;

  if (req.body.coords) { req.body.coords = req.body.coords.split(',') }

  if (req.files) {
    if (req.files.logo) {
      req.body.logo = s3.uploadFile(req.files.logo,'logo');
      req.body.logo.desc = req.body.name;
    }

    // asigna la descripción a un array de imágenes
    if (req.files.images) {

      if( !(req.files.images instanceof Array) ) {
       req.files.images = [req.files.images];
      }

      if (req.body.imageDesc) {

        if (!(req.body.imageDesc instanceof Array) ) {
          req.body.imageDesc = [req.body.imageDesc];
        }
        // asigna descripción a cada una de las imagenes
        for (var i = 0; i < req.files.images.length; i++) {
          req.files.images[i].desc = req.body.imageDesc[i];
        }
      }
      req.body.images = s3.uploadFile(req.files.images,'gallery');
    }
  }

  var newUser = new User(req.body);
  newUser.provider = 'local';
  newUser.role = 'user';
  newUser.save(function(err, user) {
    if (err) return validationError(res, err);
    // Activar esto si queremos que el usuario creado mantenga una sessión
    // var token = jwt.sign({_id: user._id }, config.secrets.session, { expiresInMinutes: 60*5 });
    // res.json({ token: token });
    res.json(200,{status:"OK"});
  });
};

/**
 * Get a single user
 */
exports.show = function (req, res, next) {
  var userId = req.params.id;

  User.findById(userId, function (err, user) {
    if (err) return next(err);
    if (!user) return res.send(401);

    City.findById(user.city, function (err, city) {
      if (err) return next(err);
      var profile = user.profile;
      profile.cityName = city.name;
      profile.urlLoc = city.url+'/'+user.url;
      res.json(profile);
    });

  });
};

/**
 * Get a single user
 */
exports.showByUrl = function (req, res, next) {
  var url = req.params.url;

  User.findOne({ url: url }, function (err, user) {
    if (err) return next(err);
    if (!user) return res.send(401);
    City.findById(user.city, function (err, city) {
      if (err) return next(err);
      var profile = user.profile;
      profile.cityName = city.name;
      profile.urlLoc = city.url+'/'+user.url
      res.json(profile);
    });

  });
};

/**
 * Deletes a user
 * restriction: 'admin'
 */
exports.destroy = function(req, res) {
  User.findByIdAndRemove(req.params.id, function(err, user) {
    s3.deleteFiles(user.logo);
    s3.deleteFiles(user.images);
    if(err) return res.send(500, err);
    return res.send(204);
  });
};

/**
 * Update user info
 */
exports.update = function(req, res, next) {
  console.log("Files");
  console.log(req.files);
  console.log("Body");
  console.log(req.body);
  // hay una sospecha de los updates de array no funcionan
  var userId = req.params.id;
  var imageDesc = [];
  User.findById(userId, function (err, user) {
    req.body.visibleEmail = req.body.visibleEmail || false;
    if (req.body.coords ) { req.body.coords = req.body.coords.split(','); }
    if (!req.body.images) { req.body.images = {}; }

    if (req.files) {

      if (req.files.logo) {
        if (user.logo != 'null') { s3.deleteFiles(user.logo); }
        user.logo.desc = req.body.name;
        user.logo = s3.uploadFile(req.files.logo,'logo');
      }

      // asigna la descripción a un array de imágenes
      if (req.files.images) {
        console.log("user images des");
        console.log(req.body.imageDesc);
        if (!_.isEmpty(user.images) && user.images[0] !== null) {
          s3.deleteFiles(user.images);
          user.images = null;
          delete user.images;
        }


        if( !(req.files.images instanceof Array) ) {
         req.files.images = [req.files.images];
        }

        if (req.body.imageDesc) {

          if (!(req.body.imageDesc instanceof Array) ) {
            req.body.imageDesc = [req.body.imageDesc];
          }
          // asigna descripción a cada una de las imagenes
          for (var i = 0; i < req.files.images.length; i++) {
            req.files.images[i].desc = req.body.imageDesc[i];
          }
        }
        req.body.images = s3.uploadFile(req.files.images,'gallery');
        console.log("imagenes 2");
        console.log(req.body.images);
      }
    }

    user = _.merge(user, req.body);
    console.log("imagenes saved");
    console.log(user.images);
    user.save(function(err) {
      if (err) return validationError(res, err);
      res.json(200,{status:"OK"});
    });
  });
};


/**
 * Change a users password
 */
exports.changePassword = function(req, res, next) {
  var userId = req.user._id;
  var oldPass = String(req.body.oldPassword);
  var newPass = String(req.body.newPassword);

  User.findById(userId, function (err, user) {
    if(user.authenticate(oldPass)) {
      user.password = newPass;
      user.save(function(err) {
        if (err) return validationError(res, err);
        res.send(200);
      });
    } else {
      res.send(403);
    }
  });
};

/**
 * Get my info
 */
exports.me = function(req, res, next) {
  console.log("user",req.user._id);
  var userId = req.user._id;
  User.findOne({
    _id: userId
  }, '-salt -hashedPassword', function(err, user) { // don't ever give out the password or salt
    if (err) return next(err);
    if (!user) return res.json(401);
    res.json(user);
  });
};

/**
 * Authentication callback
 */
exports.authCallback = function(req, res, next) {
  res.redirect('/');
};