import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import nodemailer from 'nodemailer';
import { db } from '../app.js';
import flash from "express-flash";
import {getAllMerchantNames,
  getHourlyPrice,
  generatePin,
  calculateHoldDailyPrice,
  getAllActiveTransActions,
  getDailyPrice,
  updateHoldOrder,
  daysPassed,
  getFutureDate,
  getAllPendingTransActions,
  getAllCancelledTransActions,
  getBizInfo,
  hoursPassed,
  searchByPin,
  cancelHold,
  getCurrentPrice_q,
  calculateHoldPrice_q,
  createOrder,
  calculateHoldPrice} from '../controller/core-functions.js';

const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
  };
  

// Nodemailer setup
const transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com',
    port: 587, // or 587
    secure: false, // For port 465, secure connection is enabled
    auth: {
      user: 'no-reply@holdyah.com', // Your Namecheap email address
      pass: 'B2SB4AV99tvn', // Your Namecheap email password
    },
    tls: {
      rejectUnauthorized: false, // Disables certificate validation
    },
  });
  
// Login page
router.get('/login', (req, res) => res.render('login'));

// Handle login
router.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
}));

// Dashboard page (protected)
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
      const merchantNames = await getAllMerchantNames(); 
      let section_req = '';
      console.log(merchantNames); // Fetch the merchant names
      res.render('dashboard', { user: req.user, merchantNames,section_req });  // Pass the merchant names to EJS template
  } catch (error) {
      console.error('Error rendering dashboard:', error);
      res.status(500).send('Error rendering dashboard');  // Handle errors and send a response
  }
});

router.get('/create_hold', isAuthenticated, async (req, res) => {
  try {
      const merchantNames = await getAllMerchantNames(); 
      let section_req = 'create_hold';
      console.log(merchantNames); // Fetch the merchant names
      res.render('dashboard', { user: req.user, merchantNames,section_req });  // Pass the merchant names to EJS template
  } catch (error) {
      console.error('Error rendering dashboard:', error);
      res.status(500).send('Error rendering dashboard');  // Handle errors and send a response
  }
});

router.get("/active_holds", isAuthenticated, async (req, res) => {
  console.log("active holds");
  console.log("user request");
  console.log(req.user.id);
  console.log();

  try {
    // Fetch the businessId using fetchBusinessId
    const merchantNames = await getAllMerchantNames(); 
      let section_req = 'active_holds';

    const userId = req.user.id;

    // Call getAllActiveTransActions with both user.id and businessId
    const result = await getAllActiveTransActions(userId);

    // Render the result to the EJS template
    res.render("./dashboard.ejs", { user:req.user ,result: result, merchantNames,section_req});
  } catch (err) {
    console.log(err);
    res.send("Looks like there is a problem!");
  }
});

router.get("/pending-holds", isAuthenticated, async (req, res) => {
  console.log("pending holds");
  console.log("user request");
  console.log(req.user);

  try {
    // Fetch the businessId (merchantId) using fetchBusinessId
    const merchantNames = await getAllMerchantNames(); 
    let section_req = 'pending_holds';
    const userId = req.user.id;

    // Call getAllPendingTransActions with the merchantId
    const result = await getAllPendingTransActions(userId);

    // Render the result to the EJS template
    res.render("./dashboard.ejs", { user:req.user ,result: result, merchantNames,section_req});
  } catch (err) {
    console.log(err);
    res.send("Looks like there is a problem!");
  }
});

router.get("/cancelled-holds", isAuthenticated, async (req, res) => {
  console.log("cancelled holds");
  console.log("user request");
  console.log(req.user);

  try {
    // Fetch the businessId (merchantId) using fetchBusinessId
    const userId = req.user.id;
    const merchantNames = await getAllMerchantNames(); 
    let section_req = 'canceled_holds';

    // Call getAllCancelledTransActions with the merchantId
    const result = await getAllCancelledTransActions(userId);

    // Render the result to the EJS template
    res.render("./dashboard.ejs", { user:req.user ,result: result, merchantNames,section_req});
  } catch (err) {
    console.log(err);
    res.send("Looks like there is a problem!");
  }
});

router.post("/cancelHold/:pin", (req, res) => {
  const pin = req.params.pin;
  cancelHold(pin)
    .then(() => {
      const order_summary_url = "/dashboard/" + pin;
      req.flash("success", "Hold was Canceled!");
      res.redirect(order_summary_url);
    })
    .catch((err) => {
      console.error("Error canceling hold:", err);
      res.status(500).send("Failed to cancel hold. Please try again later.");
    });
});





//Dashboard-searchOrder
router.get("/dashboard/:pin", isAuthenticated, async (req, res) => {
  const success_message = req.flash('success');
  
  try {
    const pin = req.params.pin;
    const userId = req.user.id;
    const merchantNames = await getAllMerchantNames(); 

    const result = await searchByPin(pin);

    if (!result || !result[0]) {
      throw new Error("Hold not found for the provided PIN");
    }

    // Call getBizInfo and store the result
    const business_id = result[0].merchantId; // Assuming the business_id is part of the result
    const businessInfo = await getBizInfo(business_id);

    const {
      proposed_time_hold,
      time_stamp_drop,
      time_stamp_pickup,
      hold_status,
      actual_cost_of_hold = result[0].actual_cost_of_hold,
      d_fname,
      d_lname,
      d_phone_num: d_tel,
      d_email,
      r_fname,
      r_lname,
      r_phone_num: r_tel,
      r_email,
      payment,
      package_description: package_des,
      pin: order_pin,
      cost_of_hold,
      end_time_hold,
      rate_type,
      rate
    } = result[0];

    const timeDropOffMilli = parseFloat(time_stamp_drop);
    const proposedTimeHoldMinutes = parseFloat(proposed_time_hold);
    const proposedTimeHoldMillis = proposedTimeHoldMinutes * 60 * 1000; // Convert minutes to milliseconds
    const dropOffDate = new Date(timeDropOffMilli);

    let currentCostValue = 0;
    let holdTime, pickupTime, finalHoldTime;

    if (rate_type === 'Hourly') {
      const currentCost = await getCurrentPrice_q(pin);
      const proposedPickupDate = hold_status === "done"
        ? new Date(parseFloat(time_stamp_pickup))
        : new Date(timeDropOffMilli + proposedTimeHoldMillis);

        if (hold_status === "estimate") {
          currentCostValue = 0;
        } else {
          currentCostValue = (actual_cost_of_hold == null)
            ? currentCost.toFixed(2)
            : actual_cost_of_hold;
        }

      finalHoldTime = end_time_hold === 0
        ? hoursPassed(timeDropOffMilli)
        : hoursPassed(timeDropOffMilli, time_stamp_pickup);

      pickupTime = proposedPickupDate.toLocaleString();
    } else {
      const holdDays = proposed_time_hold;
      const days = daysPassed(timeDropOffMilli, time_stamp_pickup);
      const current_price = days * rate;

      if (hold_status === "estimate") {
        currentCostValue = 0;
      } else {
        currentCostValue = (actual_cost_of_hold == null)
          ? current_price.toFixed(2)
          : actual_cost_of_hold;
      }

      pickupTime = hold_status === "done"
        ? new Date(parseFloat(time_stamp_pickup)).toLocaleString()
        : getFutureDate(timeDropOffMilli, holdDays).toLocaleString();

      finalHoldTime = days;
    }

    res.render("./dashboard.ejs", {
      d_fname,
      d_lname,
      d_tel,
      d_email,
      r_fname,
      r_lname,
      r_tel,
      r_email,
      payment,
      rate_type,
      package_des,
      hold_time: rate_type === 'Hourly' ? Math.floor(proposedTimeHoldMinutes / 60) : proposed_time_hold,
      dropOff_time: dropOffDate.toLocaleString(),
      pp_time: pickupTime,
      order_pin,
      hold_status,
      cost_of_hold,
      actual_cost_of_hold: currentCostValue,
      final_hold_time: finalHoldTime,
      business_name: businessInfo[0].name, // Use the business info in your view
      business_address: businessInfo[0].address, // Use the business info in your view
      user: req.user,
      section_req: "hold_info",
      merchantNames,
      success_message: success_message
    });

  } catch (error) {
    console.error("Error:", error);
    req.flash("error", "Hold not found!");
    res.redirect("/main");
  }
});

//update hold
router.post("/updateHold", (req, res) => {

  let time_unit = req.body.time_units;

if(req.body.rate_type === "Hourly"){
  let u_time_unit = time_unit * 60;
  getHourlyPrice(req.body["merchant"])
  .then(result => {
    // Process the result here
    console.log(result);
    let order = {
      d_fname: req.body["d_fname"].replace(/\s+/g, ''),
      d_lname: req.body["d_lname"].replace(/\s+/g, ''),
      d_tel: req.body["d_tel"],
      d_email: req.body["d_email"].replace(/\s+/g, ''),
      r_fname: req.body["r_fname"].replace(/\s+/g, ''),
      r_lname: req.body["r_lname"].replace(/\s+/g, ''),
      r_tel: req.body["d_tel"],
      payment: req.body["payment"],
      r_email: req.body["r_email"].replace(/\s+/g, ''),
      package: req.body["package_description"],
      hold_time: u_time_unit,
      rate: result[0].pricePerHour,
      pin: req.body["pin"],
      business_id: parseInt(req.body["merchant"]),
      rate_type: req.body['rate_type']
      
    };

    console.log("updating hold with business ID"+req.body["merchant"]);
  
    updateHoldOrder(order, req.body["merchant"])
      .then((result) => {
        const order_summary_url = "/dashboard/" + order.pin;
        req.flash("success","The Holder Order has Been Succesfully Updated!");
        res.redirect(order_summary_url);
      })
      .catch((err) => {
        console.log(err);
        res.send("Looks like there was a problem");
      });
  })
  .catch(error => {
    // Handle errors here
    console.error(error);
  });
}else{
    let u_time_unit = time_unit;
    getDailyPrice(req.body.merchant)
  .then(result => {
    // Process the result here
    console.log("Updating hold to daily, daily rate is:"+result[0].daily_rate);

    let dailyRate = result[0].daily_rate;
    let order = {
      d_fname: req.body["d_fname"].replace(/\s+/g, ''),
      d_lname: req.body["d_lname"].replace(/\s+/g, ''),
      d_tel: req.body["d_tel"],
      d_email: req.body["d_email"].replace(/\s+/g, ''),
      r_fname: req.body["r_fname"].replace(/\s+/g, ''),
      r_lname: req.body["r_lname"].replace(/\s+/g, ''),
      r_tel: req.body["d_tel"],
      payment: req.body["payment"],
      r_email: req.body["r_email"].replace(/\s+/g, ''),
      package: req.body["package_description"],
      hold_time: u_time_unit,
      rate: dailyRate,
      business_id:req.body["merchant"],
      pin: req.body["pin"],
      rate_type: req.body['rate_type']
    };
  
    updateHoldOrder(order, req.body["merchant"])
      .then((result) => {
        const order_summary_url = "/search/" + order.pin;
        req.flash("success","The Holder Order has Been Succesfully Updated!");
        res.redirect(order_summary_url);
      })
      .catch((err) => {
        console.log(err);
        res.send("Looks like there was a problem");
      });
  })
  .catch(error => {
    // Handle errors here
    console.error(error);
  });
}

});

router.post("/editHold/:pin", async (req, res) => {
  console.log(req.session);

    const merchantNames = await getAllMerchantNames(); 
      let section_req = 'edit_holds';

  searchByPin(req.params.pin)
    .then((result) => {
      res.render("dashboard", {
        d_fname: result[0].d_fname.replace(/\s+/g, ''),
        d_lname: result[0].d_lname.replace(/\s+/g, ''),
        d_tel: result[0].d_phone_num,
        d_email: result[0].d_email.replace(/\s+/g, ''),
        r_fname: result[0].r_fname.replace(/\s+/g, ''),
        r_lname: result[0].r_lname.replace(/\s+/g, ''),
        r_tel: result[0].r_phone_num,
        r_email: result[0].r_email.replace(/\s+/g, ''),
        package_des: result[0].package_description,
        hold_time: Math.floor(result[0].proposed_time_hold / 60),
        order_pin: req.params.pin,
        hold_status: result[0].hold_status,
        cost_of_hold: result[0].cost_of_hold,
        actual_cost_of_hold: result[0].actual_cost_of_hold,
        final_hold_time: Math.floor(result[0].end_time_hold / 60),
        user: req.user,
         merchantNames,
         section_req
      });

    })
    .catch((err) => {
      res.send("Looks like we dont a have hold for that!");
      console.log(err);
    });
});



// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) throw err;
    res.redirect('/login');
  });
});

// Sign-up page
router.get('/signup', (req, res) => res.render('signup'));

// Handle sign-up
router.post('/signup', (req, res) => {
  const { username, firstName, lastName, email, password } = req.body;

  db.query('SELECT username FROM users WHERE username = ? OR email = ?', [username, email], (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      res.send('Username or Email already exists');
    } else {
      bcrypt.genSalt(10, (err, salt) => {
        if (err) throw err;

        bcrypt.hash(password, salt, (err, hash) => {
          if (err) throw err;

          const query = 'INSERT INTO users (id,username,firstName, lastName, email, password,user_type) VALUES (?,?, ?, ?,?,?,?)';
          db.query(query, [generateRandom9DigitNumber(),username, firstName, lastName,email, hash,'freelancer'], (err) => {
            if (err) throw err;
            res.redirect('/login');
          });
        });
      });
    }
  });
});

// Password reset request page
router.get('/reset', (req, res) => res.render('reset'));

// Handle password reset request (send email with token)
router.post('/reset', (req, res) => {
  const { email } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.send('No account with that email address exists.');
    }

    const user = results[0];
    const token = crypto.randomBytes(20).toString('hex');
    const resetExpires = Date.now() + 3600000; // 1 hour

    db.query('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?', [token, new Date(resetExpires), email], (err) => {
      if (err) throw err;

      const resetLink = `http://localhost:3000/reset/${token}`;
      const mailOptions = {
        to: email,
        from: 'no-reply@holdyah.com',
        subject: 'Password Reset',
        text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
              `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
              `${resetLink}\n\n` +
              `If you did not request this, please ignore this email and your password will remain unchanged.\n`,
      };

      transporter.sendMail(mailOptions, (err) => {
        if (err) throw err;
        res.send(`An e-mail has been sent to ${email} with further instructions.`);
      });
    });
  });
});

// Reset password form page
router.get('/reset/:token', (req, res) => {
  const { token } = req.params;

  db.query('SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW()', [token], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.send('Password reset token is invalid or has expired.');
    }

    res.render('reset-password', { token });
  });
});

// Handle reset password form submission
router.post('/reset/:token', (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  db.query('SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW()', [token], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.send('Password reset token is invalid or has expired.');
    }

    const user = results[0];

    bcrypt.genSalt(10, (err, salt) => {
      if (err) throw err;

      bcrypt.hash(password, salt, (err, hash) => {
        if (err) throw err;

        db.query('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
          if (err) throw err;
          res.redirect('/login');
        });
      });
    });
  });
});

router.post("/request", isAuthenticated, async (req, res) => {
  try {
    const hold_time_price = 0; // Initialize this if it needs a default value
    const user_id = parseInt(req.user.id);
    
    // Fetch the business ID for the user
    //const business_id = await fetchBusinessId(user_id);

    const order = {
      d_fname: req.body["d_fname"].replace(/\s+/g, ''),
      d_lname: req.body["d_lname"].replace(/\s+/g, ''),
      d_tel: req.body["d_tel"],
      d_email: req.body["d_email"].replace(/\s+/g, ''),
      r_fname: req.body["r_fname"].replace(/\s+/g, ''),  
      r_lname: req.body["r_lname"].replace(/\s+/g, ''),  
      r_tel: req.body["r_tel"],      
      payment: req.body["payment"],
      r_email: req.body["r_email"].replace(/\s+/g, ''),
      user_id: user_id,
      business_id: parseInt(req.body["merchant"]),  // Assigned here
      package: req.body["package_description"],
      hold_time: req.body["time_units"],
      order_pin: generatePin(),
      cost_of_hold: hold_time_price,
      rate_type: req.body["rate_type"],
      rate: 0
    };

    if (order.rate_type === "Daily") {
      console.log("It's Daily");
      console.log("id of loocation: "+order.business_id);

      const calculatedPrice = await calculateHoldDailyPrice(order.hold_time, order.business_id);
      console.log("Hold time price:", calculatedPrice);
      order.cost_of_hold = calculatedPrice;

      const dailyPrice = await getDailyPrice(order.business_id);
      console.log("Daily price:", dailyPrice);
      order.rate = dailyPrice[0].daily_rate;

      console.log(order);
      await createOrder(order);

      const order_summary_url = "/dashboard/" + order.order_pin;
      req.flash("success", "Hold was created!");
      res.redirect(order_summary_url);
    } else {
      const hour_var = order.hold_time * 60;

      const calculatedPrice = await calculateHoldPrice(hour_var, order.business_id);
      console.log("Hold time price:", calculatedPrice);
      order.cost_of_hold = calculatedPrice;
      order.hold_time = hour_var;

      const hourlyRate = await getHourlyPrice(order.business_id);
      console.log("Hourly rate:", hourlyRate);
      order.rate = hourlyRate[0].pricePerHour;

      console.log(order);
      await createOrder(order);

      const order_summary_url = "/dashboard/" + order.order_pin;
      req.flash("success", "Hold was created!");
      res.redirect(order_summary_url);
     
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("An error occurred while processing your request.");
  }
});




function generateRandom9DigitNumber() {
  // Generate a random number between 100000000 and 999999999
  const min = 100000000;
  const max = 999999999;
  const id =  Math.floor(Math.random() * (max - min + 1)) + min;

  if(checkDuplicateId(id) === true){
    
    generateRandom9DigitNumber();
  }else{
    return id;
  }
}


function checkDuplicateId(id) {
  let sql =
    "SELECT * FROM users\
        WHERE id = '" +
    id +
    "';";

  db.query(sql, function (err, result) {
    if (err) throw err;

    if (result && result.length > 0) {
      return true;
    } else {
      return false;
    }
  });
}

export default router;
export{transporter};
