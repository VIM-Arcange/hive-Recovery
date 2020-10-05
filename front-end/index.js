const hiveClient = new dhive.Client("https://api.hive.blog");
hiveClient.database.getVersion().then((res) => {
  //console.log("blockchain version",res.blockchain_version)
  if (res.blockchain_version !== '0.23.0') {
    hiveClient.updateOperations(true)
  }
})

const RECOVERY_ACCOUNT = "hive.recovery";
const RECOVERY_EMAIL = "recovery@hivechain.app";

// Checking if the account exists
async function checkAccountName(username) {
  const ac = await hiveClient.database.call("lookup_account_names", [[username]]);

  return (ac[0] != null) ? true : false;
}

function updatePayload()
{
  const account = $("#recover-account").val();
  const secret = $("#recover-secret").val();
  const pubkey = $("#recover-pubkey").val();
  const payload = $("#recover-payload");

  const value = JSON.stringify({account:account,secret:secret,pubkey:pubkey});
  payload.val(value);
  return value;
}

$(document).ready(async function() {

  // Check if the account exists
  $("#init-account").keyup(async function() {
    const ac = await checkAccountName($(this).val());
    (ac) ? $(this).removeClass("is-invalid").addClass("is-valid") : $(this).removeClass("is-valid").addClass("is-invalid");
  });

  // Check if the account exists
  $("#recover-account").keyup(async function() {
    const ac = await checkAccountName($(this).val());
    (ac) ? $(this).removeClass("is-invalid").addClass("is-valid") : $(this).removeClass("is-valid").addClass("is-invalid");
  });

  // Processing change recovery form
  $("#recovery-init").submit(async function(e) {
    e.preventDefault();

    const account = $("#init-account").val();
    const password = $("#init-password").val();
    const email = $("#init-email").val();
    const secret = $("#init-secret").val();
    const feedback = $("#recovery-init-feedback");

    feedback.removeClass("alert-success").removeClass("alert-danger");

    try {
      if(account === "") { 
        throw ("Invalid account");
      }
      if(password === "") { 
        throw ("Invalid password");
      }
      if(secret === "") { 
        throw ("Invalid secret");
      }

      const ownerKey = dhive.PrivateKey.fromLogin(account, password, 'owner').toString();
      const memoKey = dhive.PrivateKey.fromLogin(account, password, 'memo').toString();
      const memoKeyRA = (await hiveClient.database.getAccounts([RECOVERY_ACCOUNT]))[0].memo_key;

      const data = JSON.stringify({account:account,email:email});
      const memo = steem.memo.encode(memoKey, memoKeyRA, "#" + CryptoJS.AES.encrypt(data,secret).toString());

      const op1 =["transfer", {
        from: account,
        to: RECOVERY_ACCOUNT,
        amount: "0.001 HIVE",
        memo: memo
        }];
      const op2 =["change_recovery_account", {
        account_to_recover: account,
        new_recovery_account: RECOVERY_ACCOUNT,
        extensions: []
      }];

      hiveClient.broadcast.sendOperations([op1,op2], dhive.PrivateKey.from(ownerKey))
      .then(res => {
        console.log(res)
        feedback.addClass('alert-success').text("You have successfuly changed your recovery account!");
      })
      .catch(err => {
        console.log(err)
        feedback.addClass('alert-danger').text(e.message);
      });
      
    } catch(e) {
      alert(e);
    }
  });


  // Processing recover account form
  
  $("#recover-account").keyup(async function() {
    const ac = await checkAccountName($(this).val());
    (ac) ? $(this).removeClass("is-invalid").addClass("is-valid") : $(this).removeClass("is-valid").addClass("is-invalid");
    updatePayload();
  });
  $("#recover-secret").keyup(async function() {
    updatePayload();
  });
  $("#recover-pubkey").keyup(async function() {
    updatePayload();
  });


  $("#recovery-perform").submit(async function(e) {
    e.preventDefault();

    const account = $("#recover-account").val();
    const secret = $("#recover-secret").val();
    const pubkey = $("#recover-pubkey").val();
    const feedback = $("#recovery-perform-feedback");

    const payload = JSON.stringify({account:account,secret:secret,pubkey:pubkey});
    const url = `mailto:${RECOVERY_EMAIL}?subject=Request Account Recovery - ${account}&body=${payload}`
    // open default email client
    window.location.href = url;
  });
});