const hiveClient = new dhive.Client("https://api.hive.blog");

const RECOVERY_ACCOUNT = "hive.recovery";
const RECOVERY_EMAIL = "recovery@hivechain.app";
const auths = {
  password: "",
  keys: {}
}

// Checking if the account exists
async function checkAccountName(username) {
  const ac = await hiveClient.database.call("lookup_account_names", [[username]]);

  return (ac[0] != null) ? true : false;
}

// Generate all keys from username and password
function getKeys(username, password, roles = ['owner', 'active', 'posting', 'memo']) {
  const keys = {}
  roles.forEach((role) => {
    const private = dhive.PrivateKey.fromLogin(username, password, role).toString()

    keys[role] = {}
    keys[role]["private"] = private
    keys[role]["public"] = dhive.PrivateKey.from(private).createPublic().toString()
  })
  return keys
}

// Create a suggested password
function suggestPassword() {
  const array = new Uint32Array(10)
  window.crypto.getRandomValues(array)
  return 'P'+dhive.PrivateKey.fromSeed(array).toString()
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

// Get the modal
var modal = document.getElementById("modal")

function click_newKeys() {
  const account = $("#init-account").val();

  auths.password = suggestPassword()
  auths.keys = getKeys(account,auths.password)

  document.getElementById("modal-password").textContent = auths.password
  document.getElementById("opriv").textContent = auths.keys["owner"]["private"]
  document.getElementById("opub").textContent = auths.keys["owner"]["public"]
  document.getElementById("apriv").textContent = auths.keys["active"]["private"]
  document.getElementById("apub").textContent = auths.keys["active"]["public"]
  document.getElementById("ppriv").textContent = auths.keys["posting"]["private"]
  document.getElementById("ppub").textContent = auths.keys["posting"]["public"]
  document.getElementById("mpriv").textContent = auths.keys["memo"]["private"]
  document.getElementById("mpub").textContent = auths.keys["memo"]["public"]

  modal.style.display = "block"
}

function click_continue() {
  $("#recover-pubkey").val(auths.keys["owner"]["public"])
  updatePayload()
  modal.style.display = "none";
}

function toggleSaved(element)
{
  $("#init-account").val()
  document.getElementById("modal-continue").disabled = !element.checked
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
      const accounts = await hiveClient.database.getAccounts([RECOVERY_ACCOUNT, account])

      if(!accounts[1]) {
        throw (`Unknown account ${account}`)
      }
      if(accounts[1].balance.startsWith("0.000")) {
        throw ("Insufficient HIVE balance - You need at least 0.001 HIVE")
      }

      const memoKeyRA = accounts[0].memo_key;
      const data = JSON.stringify({account:account,email:email});
      const memo = hive.memo.encode(memoKey, memoKeyRA, "#" + CryptoJS.AES.encrypt(data,secret).toString());

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
        feedback.addClass('alert-success').text("Your request to change your recovery account has been sent on the blockchain!");
      })
      .catch(err => {
        console.log(err)
        feedback.addClass('alert-danger').text(err.message);
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