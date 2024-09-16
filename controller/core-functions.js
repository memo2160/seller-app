import { db } from '../app.js';
import {transporter} from '../routes/auth.js'



function getMerchantNames() {
  return new Promise((resolve, reject) => {
      db.query('SELECT id, name FROM merchant_details', (error, results) => {
          if (error) {
              return reject(error);
          }
          // Map results to an array of objects containing both id and name
          const merchants = results.map(row => ({
              id: row.id,
              name: row.name
          }));
          resolve(merchants);
      });
  });
}

function getAllMerchantNames() {
  return getMerchantNames()  // Call the updated getMerchantNames function
      .then(merchants => {
          // Handle the result here if needed
          console.log('Merchants:', merchants);
          return merchants;  // Return the merchants so the caller receives the result
      })
      .catch(error => {
          // Handle the error here if needed
          console.error('Error fetching merchant names:', error);
          throw error;  // Rethrow the error so the caller can handle it
      });
}

  async function fetchBusinessId(user_id) {
    try {
        const result = await getBusinessId(user_id);
        return result[0].businessId; // Assuming the result is an array and you're retrieving the first row's businessId
    } catch (error) {
        console.error("Failed to fetch businessId:", error);
        return null; // Handle the error by returning null or any fallback value
    }
  }

 function getDailyPrice(business_id) {
    let sql = `
      SELECT daily_rate
      FROM merchant_details
      WHERE id = ?
    `;
  
    return new Promise((resolve, reject) => {
      db.query(sql, [business_id], function (err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });
  }

  function calculateHoldDailyPrice(holdTime, business_id) {

    return getDailyPrice(business_id)
      .then((result) => {
        console.log("daily price: " + result);
        const hold_time_price = holdTime * result[0].daily_rate;
        console.log("Hold time price is:", hold_time_price);
        return hold_time_price;
      })
      .catch((error) => {
        console.error("Error:", error.message || error);
        throw error; // Re-throw the error to maintain the promise chain
      });
  }

  function insertHoldRecord(order) {
    console.log(order);
  
    // Using parameterized query to prevent SQL injection
    let sql = `
      INSERT INTO holdyah_transaction 
        (d_fname, d_lname, r_fname, r_lname, d_phone_num, r_phone_num, d_email, r_email, package_description, proposed_time_hold, end_time_hold, pin, hold_status, cost_of_hold, payment, userId, rate_type, rate, hold_created,merchantId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?)
    `;
  
    let values = [
      capitalizeFirstLetter(order["d_fname"]),
      capitalizeFirstLetter(order["d_lname"]),
      capitalizeFirstLetter(order["r_fname"]),
      capitalizeFirstLetter(order["r_lname"]),
      order["d_tel"],
      order["r_tel"],
      order["d_email"],
      order["r_email"],
      order["package"],
      order["hold_time"],
      0, // Assuming initial hold status is 0
      order["order_pin"],
      "estimate", // Assuming initial hold status is 'estimate'
      order["cost_of_hold"],
      order["payment"],
      order["user_id"],
      order["rate_type"],
      order["rate"],
      Date.now(),
      order["business_id"]
    ];
  
    db.query(sql, values, function (err, result) {
      if (err) {
        console.error("Error inserting hold record:", err);
        throw err; // Rethrow the error to indicate failure
      } else {
        notifyOfHoldCreated(order["order_pin"]);
        console.log("Hold record inserted successfully.");
      }
    });
  }

  function createOrder(order) {
    insertHoldRecord(order);
  
    console.log("Hold order has been created!");
  }
  

   function calculateHoldPrice(holdTime, business_id, pin = 12345) {
    const hourstoHold = holdTime / 60;
  
    if (pin === 12345) {
      return getHourlyPrice(business_id)
        .then((result) => {
          console.log("hourly price: " + result);
          const hold_time_price = hourstoHold * result[0].pricePerHour;
          console.log("Hold time price is:", hold_time_price);
          return hold_time_price;
        })
        .catch((error) => {
          console.error("Error:", error.message || error);
          throw error; // Re-throw the error to maintain the promise chain
        });
  
    } else {
      return getRate(pin)
        .then((result) => {
          console.log("rate: " + result);
          const hold_time_price = hourstoHold * result[0].rate; // Assuming `result[0].rate` is the correct field
          console.log("Hold time price is:", hold_time_price);
          return hold_time_price;
        })
        .catch((error) => {
          console.error("Error:", error.message || error);
          throw error; // Re-throw the error to maintain the promise chain
        });
    }
  }

  function getHourlyPrice(business_id) {
    let sql = `
      SELECT md.pricePerHour
      FROM merchant_details md
      WHERE md.id = ?
    `;
  
    return new Promise((resolve, reject) => {
      db.query(sql, [business_id], function (err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });
  }
  

  function notifyOfHoldCreated(pin){
    searchByPin(pin)
    .then((result) => {  
  
      
      const hold_order = {
        d_fname: result[0].d_fname,
        d_lname: result[0].d_lname,
        d_tel: result[0].d_phone_num,
        d_email: result[0].d_email,
        r_fname: result[0].r_fname,
        r_lname: result[0].r_lname,
        r_tel: result[0].r_phone_num,
        r_email: result[0].r_email,
        package_des: result[0].package_description,
        hold_time: Math.floor(result[0].proposed_time_hold / 60),
        order_pin: result[0].pin,
        hold_status: result[0].hold_status,
        payment_state: result[0].payment,
        user_id: result[0].userId,
        business_id: result[0].merchantId,
        ts_drop: result[0].time_stamp_drop,
        pt_pickup: result[0].proposed_time_hold,
        rate_type: result[0].rate_type,
        cost_of_hold: result[0].cost_of_hold.toFixed(2),
        actual_cost_of_hold: 0,
        final_hold_time: Math.floor(result[0].end_time_hold / 60),
      };
  
  
  getBizInfo(hold_order.business_id)
      .then((biz_info)=>{
        const biz_details = {
          biz_name: biz_info[0].name,
          biz_address: biz_info[0].address
        }
           
        let dropoff_time, pickup_time;
  
        try {
            dropoff_time = validateTime(determineDropOffTime(hold_order.ts_drop));
            } catch (error) {
              dropoff_time = 0;
            }
  
  try {
  pickup_time = validateTime(getPickUpTime(hold_order.ts_drop, hold_order.pt_pickup));
  } catch (error) {
  pickup_time = 0;
  }
  
  let rate_t = "";
  let time_units;
  
  if(hold_order.rate_type === "Daily"){
      rate_t = "Day(s)";
      time_units = hold_order.pt_pickup;
  }else{
    rate_t = "Hour(s)";
    time_units = hold_order.hold_time;
  }
  
        const msg = ` 
        Dear ${hold_order.d_fname} ${hold_order.d_lname}, 
  
        A hold order has been created for you to drop off a package at ${biz_details.biz_name},
        located at ${biz_details.biz_address}.
        Please note that the secret pin is: ${hold_order.order_pin}
  
        Below is the summary of the hold order:
        -> Recievers Name: ${hold_order.r_fname} ${hold_order.r_lname}
        -> Dropper's Name: ${hold_order.d_fname} ${hold_order.d_lname}
        -> Dropper's Tel: ${hold_order.d_tel}
        -> Dropper's E-mail: ${hold_order.d_email}
        -> Payment State: ${hold_order.payment_state}
        -> `+rate_t+` requested: ${time_units}
        -> Package Info: ${hold_order.package_des}
  
      `;
  
      const subj = "A Hold Order Was Created!";
      
  
      const msg_d = `
        Dear ${hold_order.r_fname}  ${hold_order.r_lname},
        A hold order has been created for a package to be dropped off for you at ${biz_details.biz_name} 
        located at ${biz_details.biz_address}.
        
        Please note that the secret pin for this hold is: ${hold_order.order_pin}
  
        Below is the summary of your hold order:
        -> Dropper's Name: ${hold_order.d_fname} ${hold_order.d_lname}
        -> Reciever's Name: ${hold_order.r_fname} ${hold_order.r_lname}
        -> Reciever's Tel: ${hold_order.r_tel}
        -> Reciever's E-mail: ${hold_order.r_email}
        -> Payment State: ${hold_order.payment_state}
        -> `+rate_t+` requested: ${time_units}
        -> Cost of this Hold: $${hold_order.cost_of_hold}
        -> Package Info: ${hold_order.package_des}
      `;
  
      const subj_d = "A Hold Order Has Been Created!";
      sendEmailNotification(hold_order.d_email, msg, subj);
      sendEmailNotification(hold_order.r_email, msg_d, subj_d);
  
      })
    })
    .catch((err) => {
      console.error("Error:", err);
      // Handle the error appropriately, such as sending an error response
    });
  
  }



  function getBizInfo(business_id){
    let sql = `SELECT name, address
    FROM merchant_details
    WHERE id = ?;`;
  
    return new Promise((resolve, reject) => {
      db.query(sql, [business_id], function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  function determineDropOffTime(epochTime){
    return epochToReadableTime(parseFloat(epochTime));
  }

  function validateTime(time) {
    return typeof time === 'number' && time >= 0 && isFinite(time) ? time : 0;
  }
  

  function getPickUpTime(epochTime, minutesToAdd) {

    console.log("here is the minutes to add: " + minutesToAdd);
    // Convert minutes to milliseconds
    const millisecondsToAdd = parseFloat(minutesToAdd)* 60000; // 1 minute = 60000 milliseconds
    
    // Add milliseconds to the epoch time
    const newEpochTime = parseFloat(epochTime) + millisecondsToAdd;
    
    // Create a new Date object using the new epoch time
    const newDate = new Date(newEpochTime);
  
    console.log("the new date is : "+ newDate);
    
    // Options for formatting the date
    const options = {
        year: 'numeric',
        month: 'long', // Full month name
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true // 12-hour clock format
    };
    
    // Format the date for the average user
    const formattedDate = new Intl.DateTimeFormat(undefined, options).format(newDate);
    
    return formattedDate;
  }

  function sendEmailNotification(email, msg, subj) {
    var mailOptions = {
      from: "no-reply@holdyah.com",
      to: email,
      subject: subj,
      text: msg,
    };
  
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });
  }
  
  function generatePin() {
    // Generate a random number between 10000 (inclusive) and 100000 (exclusive)
    console.log("Generating pin!");
  
    const randomNumber = Math.floor(Math.random() * 90000) + 10000;
  
    //let results = checkDuplicatePin(randomNumber);
  
    if (!checkDuplicatePin(randomNumber)) {
      console.log("Pin is Good!");
      return randomNumber;
    } else {
      console.log("This PIN is no good, regenerating!");
      generatePin();
    }
  }


  function checkDuplicatePin(pin) {
    let sql =
      "SELECT * FROM holdyah_transaction\
          WHERE pin = '" +
      pin +
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

  function capitalizeFirstLetter(str) {
    if (!str || typeof str !== 'string') {
      return ''; // Handle invalid input
  }
  str = str.trim(); // Remove leading and trailing spaces
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function searchByPin(pin) {
    console.log("Entering search by pin");
    console.log(pin);
  
    // Using parameterized query to prevent SQL injection
    let sql = "SELECT * FROM holdyah_transaction WHERE pin = ?";
  
    return new Promise((resolve, reject) => {
      db.query(sql, [pin], function (err, result) {
        if (err) {
          console.error("Error executing SQL query:", err);
          return reject(err);
        }
        resolve(result);
      });
    });
  }


  function getCurrentPrice_q(pin){
    return getDropOffTime(pin)
      .then((result) => {
        const currentTime = Date.now();
        const dropOffTime = result[0].time_stamp_drop;
        const timeDiff = Math.floor((currentTime - dropOffTime) / 1000) / 60;
        
        // You need to return the promise from calculateHoldPrice
        return calculateHoldPrice_q(timeDiff, pin)
          .then((hold_time_price) => {
              return hold_time_price;
          })
          .catch((error) => {
            console.error("Error calculating hold price:", error);
            throw error; // Re-throw the error to maintain the promise chain
          });
      });
  }


  function getDropOffTime(pin) {
    let sql = "SELECT time_stamp_drop FROM holdyah_transaction WHERE pin = ?";
  
    return new Promise((resolve, reject) => {
      db.query(sql, [pin], function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }


  function daysPassed(dropOfTime,time_pickup) {

    let currentTime;
  if (time_pickup != null) {
      currentTime = time_pickup;
  } else {
      currentTime = Date.now();
  }
    
    // Calculate the difference in milliseconds between the current time and the supplied epoch time
    const differenceInMilliseconds = currentTime - dropOfTime;
    
    // Convert the difference from milliseconds to days
    const millisecondsInADay = 24 * 60 * 60 * 1000;
    const differenceInDays = differenceInMilliseconds / millisecondsInADay;
    
    // Return the number of days that have passed
    return parseFloat(differenceInDays.toFixed(2));
  }

  function getFutureDate(epochTime, daysToAdd) {
    // Calculate the milliseconds for the given number of days
  
    console.log(`EPOCH TIME ${epochTime} , DAYS TO ADD ${daysToAdd}`);
    const millisecondsInADay = 24 * 60 * 60 * 1000;
    const millisecondsToAdd = daysToAdd * millisecondsInADay;
  
    // Calculate the future epoch time by adding the milliseconds to the provided epoch time
    const futureEpochTime = epochTime + millisecondsToAdd;
  
    // Create a new Date object for the future epoch time
    const futureDate = new Date(futureEpochTime);
  
    // Return the future date and time in a readable format
    return futureDate.toLocaleString(); // Or customize the format as needed
  }

  function calculateHoldPrice_q(holdTime, pin ){// this function calculates price based on rate store in transaction table
    const hourstoHold = holdTime / 60;
  
    return getHourlyPrice_q(pin)
      .then((result) => {
        console.log("rate is : " + result);
        const hold_time_price = hourstoHold * result[0].rate;
        console.log("Hold time price is:", hold_time_price);
        return hold_time_price;
      })
      .catch((error) => {
        console.error("Error:", error.message || error);
        throw error; // Re-throw the error to maintain the promise chain
      });
  }

  function getHourlyPrice_q(pin) {
    let sql = `
    SELECT rate
    FROM holdyah_transaction
    WHERE pin = ?;
    
    `;
  
    return new Promise((resolve, reject) => {
      db.query(sql, [pin], function (err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });
  }

 function hoursPassed(epochTime, time_stamp_pickup = 0) {

    let differenceInMs = 0;
    let differenceInHours = 0;
    let roundedDifferenceInHours = 0;
  
    if(time_stamp_pickup === 0){
      // Get the current time in milliseconds
   const currentTime = Date.now();
      
   // Calculate the difference in milliseconds
   differenceInMs = currentTime - epochTime;
   
   // Convert milliseconds to hours
   differenceInHours = differenceInMs / (1000 * 60 * 60);
   
   // Round to the nearest 10th decimal point
   roundedDifferenceInHours = Math.round(differenceInHours * 1e10) / 1e10;
  
   console.log("Hours Passed is: "+roundedDifferenceInHours);
   
   return roundedDifferenceInHours.toFixed(2);
    }else{
      // Get the current time in milliseconds
   const pick_up_time = time_stamp_pickup;
      
   // Calculate the difference in milliseconds
    differenceInMs = pick_up_time - epochTime;
   
   // Convert milliseconds to hours
    differenceInHours = differenceInMs / (1000 * 60 * 60);
   
   // Round to the nearest 10th decimal point
   roundedDifferenceInHours = Math.round(differenceInHours * 1e10) / 1e10;
  
   console.log("Hours Passed is: "+roundedDifferenceInHours);
   
   return roundedDifferenceInHours.toFixed(2);
    }
   
  }


  function getAllActiveTransActions(businessId) {
    const sql = `
      SELECT pin, d_fname, d_lname, r_fname, r_lname, package_description, proposed_time_hold, rate_type
      FROM holdyah_transaction
      WHERE hold_status = 'Active' AND userId = ?;
    `;
    
    return new Promise((resolve, reject) => {
      db.query(sql, [businessId], (err, result) => {
        if (err) {
          console.error("Error executing query:", err);
          return reject(err);
        }
        resolve(result);
      });
    });
  }

  function getAllPendingTransActions(userId) {
    const sql = `
      SELECT pin, d_fname, d_lname, r_fname, r_lname, package_description, proposed_time_hold, rate_type 
      FROM holdyah_transaction ht 
      WHERE hold_status = 'estimate' AND userId = ?
    `;
  
    return new Promise((resolve, reject) => {
      db.query(sql, [userId], (err, result) => {
        if (err) {
          console.error("Error fetching pending transactions:", err);
          return reject(err);
        }
        resolve(result);
      });
    });
  }

  function getAllCancelledTransActions(userId) {
    const sql = `
      SELECT pin, d_fname, d_lname, r_fname, r_lname, package_description, proposed_time_hold, rate_type 
      FROM holdyah_transaction ht 
      WHERE hold_status = 'cancelled' AND userId = ?
    `;
  
    return new Promise((resolve, reject) => {
      db.query(sql, [userId], (err, result) => {
        if (err) {
          console.error("Error fetching cancelled transactions:", err);
          return reject(err);
        }
        resolve(result);
      });
    });
  }
  

  function cancelHold(pin) {
    const sql = "UPDATE holdyah_transaction SET hold_status = 'cancelled' WHERE pin = ?";
  
    return new Promise((resolve, reject) => {
      db.query(sql, [pin], (err, result) => {
        if (err) {
          console.error("Error canceling hold:", err);
          return reject(err);
        }
  
        console.log("Hold canceled successfully:", result);
        notifyCanceledHold(pin);  // Call notify only after successful update
        resolve(result);
      });
    });
  }

  function notifyCanceledHold(pin) {
    searchByPin(pin)
      .then(([result]) => {
        const {
          d_fname, d_lname, d_phone_num: d_tel, d_email,
          r_fname, r_lname, r_phone_num: r_tel, r_email,
          package_description: package_des, proposed_time_hold: pt_pickup,
          pin: order_pin, hold_status, payment, userId: user_id,
          time_stamp_drop: ts_drop, rate_type, cost_of_hold,
          actual_cost_of_hold, end_time_hold
        } = result;
  
        const hold_order = {
          d_fname, d_lname, d_tel, d_email,
          r_fname, r_lname, r_tel, r_email,
          package_des, hold_time: Math.floor(pt_pickup / 60),
          order_pin, hold_status, payment_state: payment,
          user_id, ts_drop: parseFloat(ts_drop),
          rate_type, pt_pickup: parseFloat(pt_pickup),
          cost_of_hold: cost_of_hold.toFixed(2),
          actual_cost_of_hold: 0,
          final_hold_time: Math.floor(end_time_hold / 60)
        };
  
        return getBizInfo(result[0].merchantId)
          .then(([biz_info]) => {
            const { name: biz_name, address: biz_address } = biz_info;
            
            let dropoff_time, pickup_time;
  
            try {
              dropoff_time = determineDropOffTime(hold_order.ts_drop);
            } catch (error) {
              dropoff_time = 0;
            }
  
            try {
              pickup_time = getPickUpTime(hold_order.ts_drop, hold_order.pt_pickup);
            } catch (error) {
              console.log("pickup time is : " + pickup_time);
              pickup_time = 0;
            }
  
            const rate_t = rate_type === "Daily" ? "Day(s)" : "Hour(s)";
            const time_units = rate_type === "Daily" ? hold_order.pt_pickup : hold_order.hold_time;
  
            const msg = `
              Dear ${r_fname} ${r_lname},
  
              The hold order that was created at ${biz_name}
              at ${biz_address} has been canceled!
              The secret pin is: ${order_pin}
  
              Below is the summary of the hold order:
              -> Dropper: ${d_fname} ${d_lname}
              -> Dropper Tel: ${d_tel}
              -> Dropper E-mail: ${d_email}
              -> ${rate_t} requested: ${time_units}
              -> Cost of Hold: $${hold_order.cost_of_hold}
              -> Description of Hold: ${package_des}
            `;
  
            const subj = "The Hold Order was Canceled!";
            console.log("About to send email cancelation!");
            sendEmailNotification(r_email, msg, subj);
  
            const msg_d = `
              Dear ${d_fname} ${d_lname},
  
              The hold order at ${biz_name}
              at ${biz_address} was canceled!
  
              The pin for this hold is: ${order_pin}
  
              Below is the summary of the hold order:
              -> Receiver: ${r_fname} ${r_lname}
              -> Receiver Tel: ${r_tel}
              -> Receiver E-mail: ${r_email}
              -> ${rate_t} requested: ${time_units}
              -> Cost of Hold: $${hold_order.cost_of_hold}
              -> Description of Hold: ${package_des}
            `;
  
            const subj_d = "The Hold Order was Canceled!";
            sendEmailNotification(d_email, msg_d, subj_d);
          });
      })
      .catch((err) => {
        console.error("Error:", err);
      });
  }

  function updateHoldOrder(order, business_id) {
    return calculateHoldPrice(order["hold_time"], business_id)
      .then((hold_time_price) => {
        const c_hold_time_price = order["rate_type"] === "Hourly"
          ? hold_time_price
          : order["hold_time"] * order["rate"];
  
        const sql = `
          UPDATE holdyah_transaction SET
            d_fname = ?,
            d_lname = ?,
            r_fname = ?,
            r_lname = ?,
            d_phone_num = ?,
            r_phone_num = ?,
            d_email = ?,
            payment = ?,
            r_email = ?,
            package_description = ?,
            proposed_time_hold = ?,
            cost_of_hold = ?,
            rate = ?,
            rate_type = ?,
            merchantId = ?
          WHERE pin = ?`;
  
        const values = [
          order["d_fname"],
          order["d_lname"],
          order["r_fname"],
          order["r_lname"],
          order["d_tel"],
          order["r_tel"],
          order["d_email"],
          order["payment"],
          order["r_email"],
          order["package"],
          order["hold_time"],
          c_hold_time_price,
          order["rate"],
          order["rate_type"],
          order["business_id"],
          order["pin"]
        ];
  
        return new Promise((resolve, reject) => {
          db.query(sql, values, (err, result) => {
            if (err) return reject(err);
            notifyOfHoldUpdate(order["pin"]);
            resolve(result);
          });
        });
      })
      .catch((error) => {
        console.error("Error:", error);
        throw error;
      });
  }

  function notifyOfHoldUpdate(pin) {
    searchByPin(pin)
      .then(([result]) => {
        const hold_order = {
          d_fname: result.d_fname,
          d_lname: result.d_lname,
          d_tel: result.d_phone_num,
          d_email: result.d_email,
          r_fname: result.r_fname,
          r_lname: result.r_lname,
          r_tel: result.r_phone_num,
          r_email: result.r_email,
          package_des: result.package_description,
          payment_state: result.payment,
          hold_time: Math.floor(result.proposed_time_hold / 60),
          order_pin: result.pin,
          hold_status: result.hold_status,
          user_id: result.userId,
          ts_drop: result.time_stamp_drop,
          rate_type: result.rate_type,
          pt_pickup: result.proposed_time_hold,
          cost_of_hold: result.cost_of_hold.toFixed(2),
          actual_cost_of_hold: result.actual_cost_of_hold,
          final_hold_time: Math.floor(result.end_time_hold / 60),
        };
  
        return getBizInfo(result.merchantId).then(([biz_info]) => {
          const biz_details = {
            biz_name: biz_info.name,
            biz_address: biz_info.address
          };
  
          let dropoff_time, pickup_time;
  
          try {
            dropoff_time = validateTime(determineDropOffTime(hold_order.ts_drop));
          } catch {
            dropoff_time = 0;
          }
  
          try {
            pickup_time = validateTime(getPickUpTime(hold_order.ts_drop, hold_order.pt_pickup));
          } catch {
            pickup_time = 0;
          }
  
          const rate_t = hold_order.rate_type === "Daily" ? "Day(s)" : "Hour(s)";
          const time_units = hold_order.rate_type === "Daily" ? hold_order.pt_pickup : hold_order.hold_time;
  
          const msg = `
            A hold order was updated for ${hold_order.d_fname} ${hold_order.d_lname}, 
            to drop off a package at ${biz_details.biz_name} on 
            ${biz_details.biz_address}.
            The secret pin is: ${hold_order.order_pin}.
  
            Below is the summary of the updated hold order:
            -> Your Name: ${hold_order.r_fname} ${hold_order.r_lname}
            -> Dropper's Name: ${hold_order.d_fname} ${hold_order.d_lname}
            -> Dropper's Tel: ${hold_order.d_tel}
            -> Dropper's E-mail: ${hold_order.d_email}
            -> Payment State: ${hold_order.payment_state}
            -> ${rate_t} requested by you: ${time_units}
            -> Description of Hold: ${hold_order.package_des}
          `;
  
          const msg_d = `
            A hold order has been updated for a package to be dropped for 
            ${hold_order.r_fname} ${hold_order.r_lname} 
            at ${biz_details.biz_name} on ${biz_details.biz_address}.
  
            The pin for this hold is: ${hold_order.order_pin}.
  
            Below is the summary of your updated hold order:
            -> Your Name: ${hold_order.d_fname} ${hold_order.d_lname}
            -> Receiver's Name: ${hold_order.r_fname} ${hold_order.r_lname}
            -> Receiver's Tel: ${hold_order.r_tel}
            -> Receiver's E-mail: ${hold_order.r_email}
            -> Payment State: ${hold_order.payment_state}
            -> ${rate_t} requested by you: ${time_units}
            -> Cost of this Hold: $${hold_order.cost_of_hold}
            -> Description of Hold: ${hold_order.package_des}
          `;
  
          const subject = "A Hold Order Was Updated!";
          sendEmailNotification(hold_order.r_email, msg, subject);
          sendEmailNotification(hold_order.d_email, msg_d, subject);
        });
      })
      .catch((err) => {
        console.error("Error:", err);
        // Handle the error appropriately
      });
  }
  
  

  export {getAllMerchantNames,
    getCurrentPrice_q,
    daysPassed,
    cancelHold,
    getHourlyPrice_q,
    updateHoldOrder,
    getAllPendingTransActions,
    getAllCancelledTransActions,
    getAllActiveTransActions,
    hoursPassed,
    getFutureDate,
    calculateHoldPrice_q,
    searchByPin,
    getBizInfo,
    generatePin,
    fetchBusinessId,
    calculateHoldDailyPrice,
    getDailyPrice,createOrder,
    calculateHoldPrice,
    getHourlyPrice};